-- Edição controlada do diário com histórico antes/depois e motivo obrigatório.

drop trigger if exists trg_audit_journal_lines on public.journal_lines;
create trigger trg_audit_journal_lines
  after insert or update on public.journal_lines
  for each row execute function public.audit_financial_change();

drop function if exists public.edit_journal_entry(uuid, jsonb, text);

create or replace function public.edit_journal_entry(
  p_entry_id uuid,
  p_patch jsonb,
  p_reason text
) returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_entry journal_entries%rowtype;
  v_old_entry jsonb;
  v_old_lines jsonb;
  v_new_entry jsonb;
  v_new_lines jsonb;
  v_line journal_lines%rowtype;
  v_from_line journal_lines%rowtype;
  v_to_line journal_lines%rowtype;
  v_line_count integer;
  v_amount numeric;
  v_date date;
  v_description text;
  v_reference text;
  v_category_id uuid;
  v_contact_id uuid;
  v_account_id uuid;
  v_from_account_id uuid;
  v_to_account_id uuid;
  v_document_kind entry_document_kind;
  v_document_number text;
  v_document_date date;
  v_document_notes text;
  v_key text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Dados de edição inválidos'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'Indica o motivo da alteração'; end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('amount','description','date','account_id','from_account_id','to_account_id','category_id','contact_id','reference','document_kind','document_number','document_date','document_notes') then
      raise exception 'Campo de edição não permitido: %', v_key;
    end if;
  end loop;

  select * into v_entry from journal_entries where id = p_entry_id for update;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  if v_entry.organization_id not in (select user_writable_org_ids()) and not user_can_write(v_entry.organization_id, 'ledger') then
    raise exception 'Sem permissão para editar lançamentos nesta organização';
  end if;
  if v_entry.status <> 'posted' then raise exception 'Só lançamentos confirmados e não revertidos podem ser editados'; end if;
  if v_entry.entry_type not in ('income','expense','transfer') then raise exception 'Este tipo de lançamento deve ser corrigido no módulo de origem'; end if;
  if v_entry.source in ('requisition','reversal') or v_entry.metadata ? 'requisition_id' or v_entry.metadata ? 'obligation_id' or v_entry.metadata ? 'settlement_id' or v_entry.metadata ? 'employee_loan_obligation_id' or v_entry.metadata ? 'linked_repayment_obligation_id' then
    raise exception 'Este lançamento está ligado a outro módulo; edita-o no módulo de origem';
  end if;

  v_old_entry := to_jsonb(v_entry);
  select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) into v_old_lines from journal_lines l where l.journal_entry_id = v_entry.id;

  if v_entry.entry_type = 'transfer' then
    select count(*) into v_line_count from journal_lines l where l.journal_entry_id = v_entry.id;
    if v_line_count <> 2 then raise exception 'Transferência inválida: esperadas duas linhas'; end if;
    select * into v_from_line from journal_lines where journal_entry_id = v_entry.id and direction = 'credit' order by id limit 1;
    select * into v_to_line from journal_lines where journal_entry_id = v_entry.id and direction = 'debit' order by id limit 1;
    if v_from_line.id is null or v_to_line.id is null then raise exception 'Transferência inválida: faltam contas de origem/destino'; end if;
    if p_patch ? 'account_id' then raise exception 'Uma transferência usa from_account_id e to_account_id'; end if;
    v_amount := case when p_patch ? 'amount' then (p_patch->>'amount')::numeric else v_from_line.amount end;
    v_from_account_id := case when p_patch ? 'from_account_id' then (p_patch->>'from_account_id')::uuid else v_from_line.account_id end;
    v_to_account_id := case when p_patch ? 'to_account_id' then (p_patch->>'to_account_id')::uuid else v_to_line.account_id end;
    if v_amount is null or v_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
    if v_from_account_id = v_to_account_id then raise exception 'As contas de origem e destino devem ser diferentes'; end if;
    if not exists (select 1 from accounts where id = v_from_account_id and organization_id = v_entry.organization_id and not is_archived) or not exists (select 1 from accounts where id = v_to_account_id and organization_id = v_entry.organization_id and not is_archived) then raise exception 'Conta de origem ou destino inválida/arquivada'; end if;
  else
    select count(*) into v_line_count from journal_lines l where l.journal_entry_id = v_entry.id;
    if v_line_count <> 1 then raise exception 'Este lançamento tem uma estrutura de linhas que exige correção contabilística'; end if;
    select * into v_line from journal_lines where journal_entry_id = v_entry.id limit 1;
    v_amount := case when p_patch ? 'amount' then (p_patch->>'amount')::numeric else v_line.amount end;
    v_account_id := case when p_patch ? 'account_id' then (p_patch->>'account_id')::uuid else v_line.account_id end;
    if p_patch ? 'from_account_id' or p_patch ? 'to_account_id' then raise exception 'from_account_id/to_account_id só existem em transferências'; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
    if not exists (select 1 from accounts where id = v_account_id and organization_id = v_entry.organization_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  end if;

  v_description := case when p_patch ? 'description' then nullif(btrim(p_patch->>'description'),'') else v_entry.description end;
  if v_description is null then raise exception 'A descrição é obrigatória'; end if;
  v_date := case when p_patch ? 'date' then nullif(p_patch->>'date','')::date else v_entry.transaction_date end;
  if v_date is null then raise exception 'A data do lançamento é obrigatória'; end if;
  v_reference := case when p_patch ? 'reference' then nullif(btrim(coalesce(p_patch->>'reference','')),'') else v_entry.reference end;
  v_category_id := case when p_patch ? 'category_id' then (p_patch->>'category_id')::uuid else v_entry.category_id end;
  v_contact_id := case when p_patch ? 'contact_id' then (p_patch->>'contact_id')::uuid else v_entry.contact_id end;
  if v_category_id is not null and not exists (select 1 from financial_categories c where c.id=v_category_id and c.organization_id=v_entry.organization_id and c.is_active and c.category_type=case when v_entry.entry_type='income' then 'income' else 'expense' end) then raise exception 'Categoria inválida, arquivada ou do tipo errado'; end if;
  if v_contact_id is not null and not exists (select 1 from contacts c where c.id=v_contact_id and c.organization_id=v_entry.organization_id) then raise exception 'Contacto inválido'; end if;

  v_document_kind := case when p_patch ? 'document_kind' and nullif(btrim(coalesce(p_patch->>'document_kind','')),'') is null then 'none'::entry_document_kind when p_patch ? 'document_kind' then (p_patch->>'document_kind')::entry_document_kind else v_entry.document_kind end;
  v_document_number := case when p_patch ? 'document_number' then nullif(btrim(coalesce(p_patch->>'document_number','')),'') else v_entry.document_number end;
  v_document_date := case when p_patch ? 'document_date' then nullif(p_patch->>'document_date','')::date else v_entry.document_date end;
  v_document_notes := case when p_patch ? 'document_notes' then nullif(btrim(coalesce(p_patch->>'document_notes','')),'') else v_entry.document_notes end;
  if v_document_kind is null then v_document_kind := 'none'::entry_document_kind; end if;
  if v_document_kind = 'none' then v_document_number := null; v_document_date := null; v_document_notes := null; end if;

  update journal_entries set transaction_date=v_date, description=v_description, reference=v_reference, category_id=v_category_id, contact_id=v_contact_id, document_kind=v_document_kind, document_number=v_document_number, document_date=v_document_date, document_notes=v_document_notes where id=v_entry.id;
  if v_entry.entry_type = 'transfer' then
    update journal_lines set account_id=v_from_account_id, amount=v_amount where id=v_from_line.id;
    update journal_lines set account_id=v_to_account_id, amount=v_amount where id=v_to_line.id;
  else
    update journal_lines set account_id=v_account_id, amount=v_amount where id=v_line.id;
  end if;

  select to_jsonb(e) into v_new_entry from journal_entries e where e.id=v_entry.id;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) into v_new_lines from journal_lines l where l.journal_entry_id=v_entry.id;
  insert into audit_logs (organization_id,user_id,table_name,record_id,action,old_data,new_data)
  values (v_entry.organization_id,v_uid,'journal_entry_edits',v_entry.id,'UPDATE',jsonb_build_object('entry',v_old_entry,'lines',v_old_lines),jsonb_build_object('entry',v_new_entry,'lines',v_new_lines,'reason',btrim(p_reason)));
  return json_build_object('id',v_entry.id,'entry_number',v_entry.entry_number,'updated',true);
end;
$$;

revoke all on function public.edit_journal_entry(uuid,jsonb,text) from public, anon;
grant execute on function public.edit_journal_entry(uuid,jsonb,text) to authenticated;
