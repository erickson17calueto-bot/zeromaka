-- Fase 3 (empréstimos/requisições): recuperação de registos antigos.
--
-- (a) convert_entry_to_employee_loan: um lançamento de despesa já existente
--     (posted, para um contacto funcionário, ainda não ligado a nenhuma
--     obrigação) passa a ser tratado como desembolso de empréstimo/
--     adiantamento. NÃO cria novo movimento de caixa — só reclassifica o
--     entry_type do lançamento já existente e cria a obrigação ligada por
--     disbursement_entry_id. journal_entries já é auto-auditado por
--     trg_audit_journal_entries (AFTER UPDATE), por isso não duplica
--     registo manual de auditoria.
-- (b) reclassify_requisition_as_loan: mesma mecânica, para uma requisição
--     antiga já 'aprovado' (todas eram type=expense antes desta fase) cujo
--     lançamento de despesa é, na verdade, um empréstimo/adiantamento —
--     também liga source_requisition_id.
-- (c) link_existing_repayment: uma receita já lançada (ex.: importada,
--     antes de existir este fluxo) passa a contar como devolução de um
--     empréstimo — cria a liquidação/alocação apontando para o lançamento
--     já existente, sem criar nova entrada, reclassificando o entry_type.
--
-- Prevenção de duplicados: nenhuma destas funções corre automaticamente —
-- são sempre invocadas com confirmação humana explícita (funcionário,
-- tipo). Um lançamento só pode ser convertido uma vez (bloqueado pelo
-- índice único idx_obligations_unique_disbursement_entry da Fase 1, mais
-- uma verificação explícita aqui para dar um erro claro em vez de um erro
-- de constraint genérico).

create or replace function public._convert_entry_to_loan_obligation(
  p_entry_id uuid, p_org_id uuid, p_contact_id uuid, p_kind obligation_document_kind,
  p_due_date date, p_notes text, p_source text, p_source_requisition_id uuid default null
) returns uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entry record;
  v_line record;
  v_contact record;
  v_ob_id uuid := gen_random_uuid();
  v_ob_num text;
  v_new_type journal_entry_type := case when p_kind = 'salary_advance' then 'salary_advance_disbursement' else 'loan_disbursement' end;
begin
  if p_kind not in ('employee_loan', 'salary_advance') then raise exception 'Tipo inválido — use employee_loan ou salary_advance'; end if;

  select * into v_entry from journal_entries where id = p_entry_id and organization_id = p_org_id for update;
  if v_entry.id is null then raise exception 'Lançamento não encontrado nesta organização'; end if;
  if v_entry.entry_type <> 'expense' then raise exception 'Só lançamentos de despesa podem ser convertidos em empréstimo/adiantamento'; end if;
  if v_entry.status <> 'posted' then raise exception 'Lançamento revertido não pode ser convertido'; end if;
  if exists (select 1 from financial_obligations where disbursement_entry_id = p_entry_id) then
    raise exception 'Este lançamento já está ligado a um empréstimo/adiantamento';
  end if;

  select * into v_contact from contacts where id = p_contact_id and organization_id = p_org_id;
  if v_contact.id is null then raise exception 'Contacto não pertence a esta organização'; end if;
  if v_contact.kind not in ('funcionario', 'ambos') then raise exception 'Só é possível converter para contactos do tipo funcionário'; end if;

  select jl.* into v_line from journal_lines jl where jl.journal_entry_id = p_entry_id and jl.direction = 'credit' limit 1;
  if v_line.id is null then raise exception 'Lançamento sem linha de saída de caixa — não é um desembolso válido'; end if;

  update journal_entries set
    entry_type = v_new_type,
    contact_id = p_contact_id,
    metadata = coalesce(v_entry.metadata, '{}'::jsonb) || jsonb_build_object('kind', p_kind, 'employee_loan_obligation_id', v_ob_id, 'converted_from_entry_type', v_entry.entry_type::text)
  where id = p_entry_id;

  v_ob_num := next_document_number(p_org_id, 'EMP', extract(year from v_entry.transaction_date)::int);
  insert into financial_obligations (
    id, organization_id, direction, internal_number, contact_id, document_kind,
    issue_date, due_date, original_amount, currency_code, description, notes,
    category_id, source, created_by, is_sale, disbursement_entry_id, source_requisition_id
  ) values (
    v_ob_id, p_org_id, 'receivable', v_ob_num, p_contact_id, p_kind,
    v_entry.transaction_date, coalesce(p_due_date, v_entry.transaction_date), v_line.amount, 'AOA',
    v_entry.description, p_notes, v_entry.category_id, p_source, auth.uid(), false, p_entry_id, p_source_requisition_id
  );

  return v_ob_id;
end; $function$;

revoke all on function public._convert_entry_to_loan_obligation(uuid, uuid, uuid, obligation_document_kind, date, text, text, uuid) from public, anon, authenticated;

create or replace function public.convert_entry_to_employee_loan(
  p_entry_id uuid, p_org_id uuid, p_contact_id uuid, p_kind obligation_document_kind,
  p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ob_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  v_ob_id := _convert_entry_to_loan_obligation(p_entry_id, p_org_id, p_contact_id, p_kind, p_due_date, p_notes, 'converted', null);
  return json_build_object('id', v_ob_id, 'entry_id', p_entry_id);
end; $function$;

create or replace function public.reclassify_requisition_as_loan(
  p_req_id uuid, p_org_id uuid, p_contact_id uuid, p_kind obligation_document_kind,
  p_due_date date DEFAULT NULL::date, p_installments int DEFAULT NULL::int,
  p_recovery_method text DEFAULT NULL::text, p_notes text DEFAULT NULL::text
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
  v_entry_id uuid;
  v_ob_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada nesta organização'; end if;
  if v_req.status <> 'aprovado' then raise exception 'Só requisições já aprovadas (com saída lançada) podem ser reclassificadas'; end if;
  if exists (select 1 from financial_obligations where source_requisition_id = p_req_id) then
    raise exception 'Esta requisição já está ligada a uma obrigação';
  end if;

  select je.id into v_entry_id from journal_entries je
  where je.organization_id = p_org_id and je.entry_type = 'expense' and je.metadata->>'requisition_id' = p_req_id::text
  limit 1;
  if v_entry_id is null then raise exception 'Não foi encontrado o lançamento de saída desta requisição'; end if;

  v_ob_id := _convert_entry_to_loan_obligation(v_entry_id, p_org_id, p_contact_id, p_kind, p_due_date, p_notes, 'requisition_reclassified', p_req_id);

  update requisitions set
    type = p_kind::text::requisition_type, beneficiary_contact_id = p_contact_id, due_date = coalesce(p_due_date, due_date),
    installments = p_installments, recovery_method = p_recovery_method
  where id = p_req_id;

  return json_build_object('id', v_ob_id, 'requisition_id', p_req_id, 'entry_id', v_entry_id);
end; $function$;

create or replace function public.link_existing_repayment(
  p_entry_id uuid, p_org_id uuid, p_obligation_id uuid
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_entry record;
  v_line record;
  v_ob record;
  v_paid numeric(20,2);
  v_outstanding numeric(20,2);
  v_sid uuid := gen_random_uuid();
  v_num text;
  v_new_type journal_entry_type;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;

  select * into v_entry from journal_entries where id = p_entry_id and organization_id = p_org_id for update;
  if v_entry.id is null then raise exception 'Lançamento não encontrado nesta organização'; end if;
  if v_entry.entry_type <> 'income' then raise exception 'Só lançamentos de receita podem ser associados como devolução'; end if;
  if v_entry.status <> 'posted' then raise exception 'Lançamento revertido não pode ser associado'; end if;
  if exists (select 1 from settlement_allocations where journal_entry_id = p_entry_id) then
    raise exception 'Este lançamento já está associado a uma liquidação';
  end if;

  select * into v_ob from financial_obligations where id = p_obligation_id and organization_id = p_org_id for update;
  if v_ob.id is null then raise exception 'Obrigação não encontrada nesta organização'; end if;
  if v_ob.document_kind not in ('employee_loan', 'salary_advance') then raise exception 'Só empréstimos/adiantamentos podem receber devoluções associadas'; end if;
  if v_ob.lifecycle_status <> 'open' then raise exception 'Obrigação não está aberta'; end if;

  select jl.* into v_line from journal_lines jl where jl.journal_entry_id = p_entry_id and jl.direction = 'debit' limit 1;
  if v_line.id is null then raise exception 'Lançamento sem linha de entrada de caixa — não é uma receita válida'; end if;

  select coalesce(sum(a.allocated_amount), 0) into v_paid
    from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted'
    where a.obligation_id = p_obligation_id;
  v_outstanding := v_ob.original_amount - v_paid;
  if v_line.amount > v_outstanding then raise exception 'Valor do lançamento (%) excede o saldo pendente da obrigação (%)', v_line.amount, v_outstanding; end if;

  v_new_type := case when v_ob.document_kind = 'salary_advance' then 'salary_advance_repayment' else 'loan_repayment' end;
  update journal_entries set
    entry_type = v_new_type,
    metadata = coalesce(v_entry.metadata, '{}'::jsonb) || jsonb_build_object('linked_repayment_obligation_id', p_obligation_id, 'converted_from_entry_type', v_entry.entry_type::text)
  where id = p_entry_id;

  v_num := next_document_number(p_org_id, 'LIQ', extract(year from v_entry.transaction_date)::int);
  insert into settlements (id, organization_id, internal_number, direction, contact_id, account_id, payment_date, total_amount, status, created_by, notes)
  values (v_sid, p_org_id, v_num, 'incoming', v_ob.contact_id, v_line.account_id, v_entry.transaction_date, v_line.amount, 'posted', v_uid, 'Devolução associada a lançamento existente ' || v_entry.entry_number);
  insert into settlement_allocations (organization_id, settlement_id, obligation_id, allocated_amount, journal_entry_id)
  values (p_org_id, v_sid, p_obligation_id, v_line.amount, p_entry_id);

  return json_build_object('settlement_id', v_sid, 'obligation_id', p_obligation_id, 'entry_id', p_entry_id);
end; $function$;

revoke all on function public.convert_entry_to_employee_loan(uuid, uuid, uuid, obligation_document_kind, date, text) from public, anon;
grant execute on function public.convert_entry_to_employee_loan(uuid, uuid, uuid, obligation_document_kind, date, text) to authenticated;
revoke all on function public.reclassify_requisition_as_loan(uuid, uuid, uuid, obligation_document_kind, date, int, text, text) from public, anon;
grant execute on function public.reclassify_requisition_as_loan(uuid, uuid, uuid, obligation_document_kind, date, int, text, text) to authenticated;
revoke all on function public.link_existing_repayment(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_existing_repayment(uuid, uuid, uuid) to authenticated;
