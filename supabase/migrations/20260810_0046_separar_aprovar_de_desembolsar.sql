-- Fase 1 (requisições): separa aprovar de desembolsar.
--
-- approve_requisition ganha p_disburse boolean default true — chamadas
-- existentes (sem este parâmetro) continuam a aprovar+desembolsar no
-- mesmo passo, exatamente como antes (compatibilidade total). Com
-- p_disburse=false, só muda o estado para 'aguardando_desembolso', sem
-- tocar no caixa nem criar obrigação.
--
-- Nova RPC disburse_requisition desembolsa uma requisição já em
-- 'aguardando_desembolso'.
--
-- Para requisições do tipo employee_loan/salary_advance, o desembolso (em
-- qualquer dos dois caminhos) reusa grant_employee_loan — mesma obrigação,
-- mesmas validações de funcionário/categoria — e liga
-- financial_obligations.source_requisition_id à requisição de origem.
-- Requisições normais continuam a postar a despesa diretamente, tal como
-- approve_requisition sempre fez.
--
-- Lógica de desembolso partilhada por um helper interno para não duplicar
-- código entre os dois pontos de entrada.
--
-- Duplo-clique/corrida: SELECT ... FOR UPDATE na requisição serializa
-- tentativas concorrentes — a segunda só prossegue depois da primeira
-- confirmar, e nessa altura o estado já não é o esperado, pelo que é
-- rejeitada com um erro claro em vez de desembolsar duas vezes.
--
-- SECURITY DEFINER + search_path seguro: alinha approve_requisition com o
-- resto das RPCs financeiras do projeto (antes corria com o privilégio do
-- chamador, dependendo de políticas de escrita diretas em journal_entries/
-- journal_lines).

create or replace function public._disburse_requisition_ledger(
  p_req requisitions, p_account_id uuid, p_org_id uuid, p_uid uuid
) returns uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eid uuid;
  v_num text;
  v_ob json;
begin
  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then
    raise exception 'Conta inválida ou arquivada';
  end if;

  if p_req.type in ('employee_loan', 'salary_advance') then
    if p_req.beneficiary_contact_id is null then raise exception 'Requisição sem funcionário beneficiário'; end if;
    v_ob := grant_employee_loan(
      p_org_id, p_req.beneficiary_contact_id, p_account_id, p_req.amount::numeric,
      case when p_req.type = 'salary_advance' then 'salary_advance'::obligation_document_kind else 'employee_loan'::obligation_document_kind end,
      current_date, p_req.due_date, p_req.purpose, null, p_req.number, null
    );
    v_eid := (v_ob->>'entry_id')::uuid;
    update financial_obligations set source_requisition_id = p_req.id where id = (v_ob->>'id')::uuid;
  else
    v_num := next_entry_number(p_org_id, extract(year from current_date)::int);
    v_eid := gen_random_uuid();
    insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, idempotency_key, created_by, metadata)
    values (v_eid, p_org_id, v_num, 'expense', current_date, 'Requisição ' || p_req.number || ' — ' || left(p_req.purpose, 40), 'requisition', gen_random_uuid(), p_uid, jsonb_build_object('requisition_id', p_req.id));
    insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values (p_org_id, v_eid, p_account_id, 'credit', p_req.amount);
  end if;

  return v_eid;
end; $function$;

revoke all on function public._disburse_requisition_ledger(requisitions, uuid, uuid, uuid) from public, anon, authenticated;

drop function if exists public.approve_requisition(uuid, uuid, uuid);

create or replace function public.approve_requisition(
  p_req_id uuid, p_account_id uuid, p_org_id uuid, p_disburse boolean DEFAULT true
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Requisição não está pendente'; end if;

  if not p_disburse then
    update requisitions set status = 'aguardando_desembolso', decided_at = now() where id = p_req_id;
    return json_build_object('requisition_id', p_req_id, 'status', 'aguardando_desembolso', 'entry_id', null);
  end if;

  v_eid := _disburse_requisition_ledger(v_req, p_account_id, p_org_id, v_uid);

  update requisitions set
    status = case when v_req.type in ('employee_loan', 'salary_advance') then 'desembolsada'::req_status else 'aprovado'::req_status end,
    account_id = p_account_id, decided_at = now()
  where id = p_req_id;

  return json_build_object('requisition_id', p_req_id, 'status', case when v_req.type in ('employee_loan', 'salary_advance') then 'desembolsada' else 'aprovado' end, 'entry_id', v_eid);
end; $function$;

create or replace function public.disburse_requisition(
  p_req_id uuid, p_account_id uuid, p_org_id uuid
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'aguardando_desembolso' then raise exception 'Requisição não está a aguardar desembolso'; end if;

  v_eid := _disburse_requisition_ledger(v_req, p_account_id, p_org_id, v_uid);

  update requisitions set status = 'desembolsada', account_id = p_account_id, decided_at = now() where id = p_req_id;

  return json_build_object('requisition_id', p_req_id, 'status', 'desembolsada', 'entry_id', v_eid);
end; $function$;

revoke all on function public.approve_requisition(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.approve_requisition(uuid, uuid, uuid, boolean) to authenticated;
revoke all on function public.disburse_requisition(uuid, uuid, uuid) from public, anon;
grant execute on function public.disburse_requisition(uuid, uuid, uuid) to authenticated;
