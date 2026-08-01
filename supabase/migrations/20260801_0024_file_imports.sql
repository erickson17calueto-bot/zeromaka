-- Fase 6 — importação segura de ficheiros para revisão e aprovação
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_file_name text not null,
  source_format text not null check (source_format in ('xlsx', 'csv', 'pdf')),
  target_type text not null check (target_type in ('transaction', 'receivable', 'payable')),
  status text not null default 'review'
    check (status in ('review', 'applying', 'applied', 'cancelled', 'partial_error')),
  total_rows integer not null default 0 check (total_rows >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  duplicate_key text,
  validation_status text not null default 'ready'
    check (validation_status in ('ready', 'error', 'applied', 'discarded')),
  decision text not null default 'pending'
    check (decision in ('pending', 'keep', 'discard')),
  error_message text,
  applied_record_id uuid,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index if not exists idx_import_batches_org on import_batches(organization_id, created_at desc);
create index if not exists idx_import_rows_batch on import_rows(batch_id, row_number);
create index if not exists idx_import_rows_duplicate on import_rows(batch_id, duplicate_key);

alter table import_batches enable row level security;
alter table import_rows enable row level security;

revoke all on table import_batches, import_rows from anon;
grant select, insert, update on table import_batches, import_rows to authenticated;

drop policy if exists import_batches_select on import_batches;
create policy import_batches_select on import_batches for select to authenticated
  using (organization_id in (select user_writable_org_ids()));

drop policy if exists import_batches_insert on import_batches;
create policy import_batches_insert on import_batches for insert to authenticated
  with check (organization_id in (select user_writable_org_ids()) and created_by = auth.uid());

drop policy if exists import_batches_update on import_batches;
create policy import_batches_update on import_batches for update to authenticated
  using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));

drop policy if exists import_rows_select on import_rows;
create policy import_rows_select on import_rows for select to authenticated
  using (organization_id in (select user_writable_org_ids()));

drop policy if exists import_rows_insert on import_rows;
create policy import_rows_insert on import_rows for insert to authenticated
  with check (organization_id in (select user_writable_org_ids()));

drop policy if exists import_rows_update on import_rows;
create policy import_rows_update on import_rows for update to authenticated
  using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));

create or replace function apply_import_row(
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

    if v_direction = 'income' then
      v_result := public.post_income(
        p_org_id := v_row.organization_id, p_account_id := v_account_id,
        p_amount := v_amount, p_description := v_description, p_date := v_date,
        p_category_id := v_category_id, p_contact_id := nullif(v_data->>'contact_id', '')::uuid,
        p_metadata := jsonb_build_object('import_batch_id', v_row.batch_id, 'import_row_id', v_row.id, 'source', 'file_import')
      );
    else
      v_result := public.post_expense(
        p_org_id := v_row.organization_id, p_account_id := v_account_id,
        p_amount := v_amount, p_description := v_description, p_date := v_date,
        p_category_id := v_category_id, p_contact_id := nullif(v_data->>'contact_id', '')::uuid,
        p_metadata := jsonb_build_object('import_batch_id', v_row.batch_id, 'import_row_id', v_row.id, 'source', 'file_import')
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
      p_currency := 'AOA', p_description := v_description, p_notes := null,
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

revoke all on function apply_import_row(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function apply_import_row(uuid, uuid, uuid, uuid) to authenticated;
