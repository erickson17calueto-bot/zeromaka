-- Propaga os novos campos de documento (tipo/número/data/observação) da
-- importação de transações até ao lançamento — mesma lacuna que existia com
-- p_reference antes da Fase 1: os dados já chegavam a normalized_data, mas
-- apply_import_row nunca os passava a post_income/post_expense.
-- Sem mudança de assinatura (mesmos parâmetros), por isso CREATE OR REPLACE
-- simples chega — ver 20260805_0031 para o porquê de post_income/post_expense
-- precisarem de DROP quando a assinatura muda; aqui não muda.

create or replace function public.apply_import_row(
  p_row_id uuid,
  p_account_id uuid default null,
  p_contact_id uuid default null,
  p_category_id uuid default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_batch record;
  v_data jsonb;
  v_result json;
  v_target text;
  v_direction text;
  v_amount numeric;
  v_date date;
  v_issue_date date;
  v_due_date date;
  v_account_id uuid;
  v_contact_id uuid;
  v_category_id uuid;
  v_description text;
  v_document_kind text;
  v_external_number text;
  v_is_sale boolean;
  v_reference text;
  v_entry_doc_kind text;
  v_document_number text;
  v_document_date date;
  v_document_notes text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_row from import_rows where id = p_row_id for update;
  if v_row.id is null then raise exception 'Linha de importação não encontrada'; end if;
  if v_row.organization_id not in (select user_writable_org_ids()) then
    raise exception 'Sem permissão nesta organização';
  end if;
  if v_row.validation_status = 'applied' then
    return json_build_object('id', v_row.applied_record_id, 'already_applied', true);
  end if;
  if v_row.decision <> 'keep' then
    raise exception 'A linha precisa estar aprovada para ser lançada';
  end if;

  select * into v_batch from import_batches where id = v_row.batch_id;
  v_data := v_row.normalized_data;
  v_target := v_batch.target_type;
  v_amount := nullif(v_data->>'amount', '')::numeric;
  if v_amount is null or v_amount <= 0 then raise exception 'Valor inválido na linha %', v_row.row_number; end if;

  if v_target = 'transaction' then
    v_account_id := coalesce(p_account_id, nullif(v_data->>'account_id', '')::uuid);
    if v_account_id is null or not exists (
      select 1 from accounts where id = v_account_id and organization_id = v_row.organization_id and not is_archived
    ) then raise exception 'Conta inválida na linha %', v_row.row_number; end if;

    v_direction := coalesce(nullif(v_data->>'direction', ''), 'expense');
    v_description := coalesce(nullif(v_data->>'description', ''), 'Importação de ficheiro');
    v_date := coalesce(nullif(v_data->>'date', '')::date, current_date);
    v_category_id := coalesce(p_category_id, nullif(v_data->>'category_id', '')::uuid);
    v_reference := nullif(v_data->>'reference', '');
    v_entry_doc_kind := nullif(v_data->>'document_kind', '');
    v_document_number := nullif(v_data->>'document_number', '');
    v_document_date := nullif(v_data->>'document_date', '')::date;
    v_document_notes := nullif(v_data->>'document_notes', '');

    if v_direction = 'income' then
      v_result := public.post_income(
        p_org_id := v_row.organization_id, p_account_id := v_account_id,
        p_amount := v_amount, p_description := v_description, p_date := v_date,
        p_category_id := v_category_id, p_contact_id := nullif(v_data->>'contact_id', '')::uuid,
        p_reference := v_reference,
        p_metadata := jsonb_build_object('import_batch_id', v_row.batch_id, 'import_row_id', v_row.id, 'source', 'file_import'),
        p_document_kind := v_entry_doc_kind::entry_document_kind, p_document_number := v_document_number,
        p_document_date := v_document_date, p_document_notes := v_document_notes
      );
    else
      v_result := public.post_expense(
        p_org_id := v_row.organization_id, p_account_id := v_account_id,
        p_amount := v_amount, p_description := v_description, p_date := v_date,
        p_category_id := v_category_id, p_contact_id := nullif(v_data->>'contact_id', '')::uuid,
        p_reference := v_reference,
        p_metadata := jsonb_build_object('import_batch_id', v_row.batch_id, 'import_row_id', v_row.id, 'source', 'file_import'),
        p_document_kind := v_entry_doc_kind::entry_document_kind, p_document_number := v_document_number,
        p_document_date := v_document_date, p_document_notes := v_document_notes
      );
    end if;
  else
    v_contact_id := coalesce(p_contact_id, nullif(v_data->>'contact_id', '')::uuid);
    if v_contact_id is null or not exists (
      select 1 from contacts where id = v_contact_id and organization_id = v_row.organization_id
    ) then raise exception 'Contacto inválido na linha %', v_row.row_number; end if;

    v_issue_date := coalesce(nullif(v_data->>'issue_date', '')::date, current_date);
    v_due_date := coalesce(nullif(v_data->>'due_date', '')::date, v_issue_date);
    if v_due_date < v_issue_date then raise exception 'Vencimento anterior à emissão na linha %', v_row.row_number; end if;
    v_category_id := coalesce(p_category_id, nullif(v_data->>'category_id', '')::uuid);
    v_document_kind := coalesce(nullif(v_data->>'document_kind', ''), case when v_target = 'receivable' then 'invoice_reference' else 'supplier_invoice' end);
    v_external_number := nullif(v_data->>'external_document_number', '');
    v_description := nullif(v_data->>'description', '');
    v_is_sale := coalesce((v_data->>'is_sale')::boolean, v_target = 'receivable');

    v_result := public.create_financial_obligation(
      p_org_id := v_row.organization_id,
      p_direction := case when v_target = 'receivable' then 'receivable'::obligation_direction else 'payable'::obligation_direction end,
      p_contact_id := v_contact_id, p_due_date := v_due_date, p_amount := v_amount,
      p_document_kind := v_document_kind::obligation_document_kind,
      p_external_document_number := v_external_number, p_issue_date := v_issue_date,
      p_currency := 'AOA', p_description := v_description, p_notes := nullif(v_data->>'document_notes', ''),
      p_category_id := v_category_id, p_is_sale := v_is_sale
    );
  end if;

  update import_rows
  set validation_status = 'applied', error_message = null,
      applied_record_id = (v_result->>'id')::uuid, applied_at = now()
  where id = v_row.id;

  return coalesce(v_result, '{}'::json)::json;
exception when others then
  update import_rows set validation_status = 'error', error_message = sqlerrm where id = p_row_id;
  raise;
end;
$$;
