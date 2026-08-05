-- Fase 1 do overhaul de importação: preservar a referência do documento (FATURA)
-- nos movimentos lançados a partir de uma importação, e semear categorias com
-- subcategorias para organizações criadas a partir de agora.
--
-- Ambas as alterações são aditivas via CREATE OR REPLACE FUNCTION: nenhuma
-- tabela ou coluna nova, nenhuma linha de organizações existentes é tocada.
-- `seed_default_categories` só corre uma vez, na criação da organização — mudar
-- o corpo da função não afeta quem já foi semeado.

-- 1) apply_import_row passa a repassar a referência do documento (FATURA/N.º)
--    para post_income/post_expense, que já aceitavam p_reference mas nunca o
--    recebiam nesta chamada. Único acrescento: leitura de v_data->>'reference'
--    e o parâmetro p_reference nas duas chamadas do ramo 'transaction'.
CREATE OR REPLACE FUNCTION public.apply_import_row(p_row_id uuid, p_account_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    if v_direction = 'income' then
      v_result := public.post_income(
        p_org_id := v_row.organization_id, p_account_id := v_account_id,
        p_amount := v_amount, p_description := v_description, p_date := v_date,
        p_category_id := v_category_id, p_contact_id := nullif(v_data->>'contact_id', '')::uuid,
        p_reference := v_reference,
        p_metadata := jsonb_build_object('import_batch_id', v_row.batch_id, 'import_row_id', v_row.id, 'source', 'file_import')
      );
    else
      v_result := public.post_expense(
        p_org_id := v_row.organization_id, p_account_id := v_account_id,
        p_amount := v_amount, p_description := v_description, p_date := v_date,
        p_category_id := v_category_id, p_contact_id := nullif(v_data->>'contact_id', '')::uuid,
        p_reference := v_reference,
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
$function$;

-- 2) seed_default_categories passa a semear categorias com subcategorias
--    (parent_id) para organizações novas. 'Combustível' e 'Telecomunicações'
--    deixam de ser categorias soltas e passam a viver dentro de 'Transporte' e
--    'Comunicações' respetivamente; isto só afeta quem for semeado a partir de
--    agora — organizações já existentes mantêm as categorias que já têm.
CREATE OR REPLACE FUNCTION public.seed_default_categories(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_transporte uuid;
  v_comunicacoes uuid;
  v_compra_mercadorias uuid;
  v_outras_despesas uuid;
  v_equipamento uuid;
BEGIN
  INSERT INTO financial_categories (organization_id, name, category_type, is_system, created_by) VALUES
    (p_org_id, 'Venda de produtos', 'income', true, v_uid),
    (p_org_id, 'Prestação de serviços', 'income', true, v_uid),
    (p_org_id, 'Outros recebimentos', 'income', true, v_uid),
    (p_org_id, 'Fornecedores', 'expense', true, v_uid),
    (p_org_id, 'Salários', 'expense', true, v_uid),
    (p_org_id, 'Transporte', 'expense', true, v_uid),
    (p_org_id, 'Renda', 'expense', true, v_uid),
    (p_org_id, 'Comunicações', 'expense', true, v_uid),
    (p_org_id, 'Alimentação', 'expense', true, v_uid),
    (p_org_id, 'Impostos', 'expense', true, v_uid),
    (p_org_id, 'Manutenção', 'expense', true, v_uid),
    (p_org_id, 'Outras despesas', 'expense', true, v_uid),
    (p_org_id, 'Compra de mercadorias', 'expense', true, v_uid),
    (p_org_id, 'Equipamento', 'expense', true, v_uid)
  ON CONFLICT (organization_id, name, category_type) DO NOTHING;

  SELECT id INTO v_transporte FROM financial_categories WHERE organization_id = p_org_id AND name = 'Transporte' AND category_type = 'expense';
  SELECT id INTO v_comunicacoes FROM financial_categories WHERE organization_id = p_org_id AND name = 'Comunicações' AND category_type = 'expense';
  SELECT id INTO v_compra_mercadorias FROM financial_categories WHERE organization_id = p_org_id AND name = 'Compra de mercadorias' AND category_type = 'expense';
  SELECT id INTO v_outras_despesas FROM financial_categories WHERE organization_id = p_org_id AND name = 'Outras despesas' AND category_type = 'expense';
  SELECT id INTO v_equipamento FROM financial_categories WHERE organization_id = p_org_id AND name = 'Equipamento' AND category_type = 'expense';

  INSERT INTO financial_categories (organization_id, name, category_type, is_system, created_by, parent_id) VALUES
    (p_org_id, 'Combustível', 'expense', true, v_uid, v_transporte),
    (p_org_id, 'Táxi e entregas', 'expense', true, v_uid, v_transporte),
    (p_org_id, 'Portagens', 'expense', true, v_uid, v_transporte),
    (p_org_id, 'Manutenção de viatura', 'expense', true, v_uid, v_transporte),
    (p_org_id, 'Telefone', 'expense', true, v_uid, v_comunicacoes),
    (p_org_id, 'Internet', 'expense', true, v_uid, v_comunicacoes),
    (p_org_id, 'Dados móveis', 'expense', true, v_uid, v_comunicacoes),
    (p_org_id, 'Software', 'expense', true, v_uid, v_comunicacoes),
    (p_org_id, 'Mercadoria para revenda', 'expense', true, v_uid, v_compra_mercadorias),
    (p_org_id, 'Consumíveis', 'expense', true, v_uid, v_compra_mercadorias),
    (p_org_id, 'Matéria-prima', 'expense', true, v_uid, v_compra_mercadorias),
    (p_org_id, 'Embalagens', 'expense', true, v_uid, v_compra_mercadorias),
    (p_org_id, 'Limpeza', 'expense', true, v_uid, v_outras_despesas),
    (p_org_id, 'Bancárias', 'expense', true, v_uid, v_outras_despesas),
    (p_org_id, 'Taxas e licenças', 'expense', true, v_uid, v_outras_despesas),
    (p_org_id, 'Diversos', 'expense', true, v_uid, v_outras_despesas),
    (p_org_id, 'Computadores', 'expense', true, v_uid, v_equipamento),
    (p_org_id, 'Mobiliário', 'expense', true, v_uid, v_equipamento),
    (p_org_id, 'Ferramentas', 'expense', true, v_uid, v_equipamento)
  ON CONFLICT (organization_id, name, category_type) DO NOTHING;
END; $function$;
