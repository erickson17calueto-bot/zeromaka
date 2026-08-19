-- Fase 3 do plano de evolução de permissões (auditoria 2026-08-19): liga as
-- RPCs de requisições e liquidações a user_can_do() em vez do can_write
-- genérico de role_resource_permissions. É aqui que a Fase 2 (tabela
-- role_action_permissions, até agora inerte) passa a ter efeito real.
--
-- Achado ainda por fechar depois da Fase 1: requisitante e aprovador
-- continuavam a partilhar o mesmo bit can_write em 'requisitions', porque
-- approve_requisition/reject_requisition (caminho sem desembolso) e
-- create_requisition/update_requisition_draft/delete_requisition_draft
-- verificavam todos user_can_write(org,'requisitions') — o MESMO bit. A
-- Fase 1 bloqueou autoaprovação (created_by = quem chama), mas não
-- impedia um REQUISITANTE de aprovar/rejeitar a requisição de OUTRO
-- requisitante — só não a própria. Dois requisitantes podiam alternar-se
-- a aprovar um do outro, esvaziando o controlo de dupla validação que o
-- papel aprovador existe para garantir. Fechado agora: create_draft/
-- edit_own_draft ficam só para requisitante; approve/reject ficam só
-- para aprovador — bits independentes, não mais o mesmo can_write.
--
-- Também ativa, pela primeira vez, a capacidade de caixa desembolsar
-- requisições e empréstimos (resource='requisitions'/'loans',
-- action='disburse') — a role_action_permissions já tinha estas linhas
-- desde a Fase 2, mas nenhuma RPC as consultava; hoje só owner/admin/
-- finance conseguem desembolsar. Este é o único ponto desta migração que
-- concede uma capacidade nova (a caixa) em vez de só reorganizar as já
-- existentes — é literalmente o propósito com que o papel 'caixa' foi
-- criado nesta sessão, só nunca tinha sido ligado a nenhuma RPC.
--
-- post_settlement troca user_can_write(org,'loans'/'obligations_receivable'/
-- 'obligations_payable') por user_can_do(org, resource, 'receive'|'settle')
-- — comportamento IDÊNTICO para cobrador/pagador/rh hoje (o seed da Fase 2
-- reproduz exatamente os bits que já existiam), só o mecanismo muda.
--
-- Deliberadamente NÃO tocadas nesta fase: create_financial_obligation,
-- update_obligation, cancel_obligation, reverse_settlement continuam só
-- user_writable_org_ids() (owner/admin/finance) — rh/cobrador/pagador
-- mantêm-se execução-só no próprio domínio (liquidar, não criar/editar/
-- cancelar/reverter). Decisão explícita, não esquecimento: o seed da
-- Fase 2 já tinha create_draft/edit_own_draft/reverse=false para os três,
-- documentando esta fronteira.
--
-- Risco conhecido e aceite nesta fase: a UI de /app/requisicoes ainda não
-- esconde os botões Aprovar/Editar/Apagar por papel (mostra-os sempre que
-- status='pendente', independentemente de quem está a ver) — depois desta
-- migração, um requisitante que clique "Aprovar" na requisição de outro
-- passa a ver um toast de erro em vez de a ação ser silenciosamente aceite
-- como acontecia até agora. Correção da UI fica para a Fase 8; o RPC
-- recusar com mensagem clara já é a barreira de segurança real.

create or replace function public.create_requisition(
  p_org_id uuid, p_requester text, p_approver text, p_department text,
  p_items jsonb, p_amount numeric, p_date date, p_purpose text, p_category text,
  p_type requisition_type default 'expense', p_beneficiary_contact_id uuid default null,
  p_due_date date default null, p_installments int default null, p_recovery_method text default null
) returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_number text;
  v_amount numeric;
  v_n int;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_do(p_org_id, 'requisitions', 'create_draft') then
    raise exception 'Sem permissão';
  end if;
  if p_requester is null or btrim(p_requester) = '' then raise exception 'Requisitante obrigatório'; end if;
  if p_approver is null or btrim(p_approver) = '' then raise exception 'Aprovador obrigatório'; end if;
  if p_purpose is null or btrim(p_purpose) = '' then raise exception 'Finalidade obrigatória'; end if;
  if p_category is null or btrim(p_category) = '' then raise exception 'Categoria obrigatória'; end if;

  v_amount := case
    when p_items is not null and jsonb_array_length(p_items) > 0
      then (select coalesce(sum((it->>'qty')::numeric * (it->>'unitPrice')::numeric), 0) from jsonb_array_elements(p_items) it)
    else p_amount
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;

  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':requisitions'));
  select count(*) + 1 into v_n from requisitions where organization_id = p_org_id;
  v_number := 'RQ-' || lpad(v_n::text, 3, '0') || '/' || lpad(extract(month from current_date)::text, 2, '0') || '/' || extract(year from current_date)::text;

  insert into requisitions (
    id, organization_id, number, requester, approver, department, items, amount, date, purpose, category,
    status, type, beneficiary_contact_id, due_date, installments, recovery_method, created_by
  ) values (
    v_id, p_org_id, v_number, p_requester, p_approver, nullif(btrim(coalesce(p_department, '')), ''),
    coalesce(p_items, '[]'::jsonb), v_amount, coalesce(p_date, current_date), p_purpose, p_category,
    'pendente', p_type, p_beneficiary_contact_id, p_due_date, p_installments, p_recovery_method, v_uid
  );

  return json_build_object('id', v_id, 'number', v_number, 'amount', v_amount);
end; $function$;

create or replace function public.update_requisition_draft(p_req_id uuid, p_org_id uuid, p_patch jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
  v_items jsonb;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Só requisições pendentes podem ser editadas'; end if;

  if p_org_id not in (select user_writable_org_ids()) then
    if not user_can_do(p_org_id, 'requisitions', 'edit_own_draft') then raise exception 'Sem permissão'; end if;
    if v_req.created_by is distinct from v_uid then raise exception 'Só podes editar as tuas próprias requisições'; end if;
  end if;

  v_items := case when p_patch ? 'items' then p_patch->'items' else v_req.items end;
  v_amount := case
    when p_patch ? 'items' and jsonb_array_length(v_items) > 0
      then (select coalesce(sum((it->>'qty')::numeric * (it->>'unitPrice')::numeric), 0) from jsonb_array_elements(v_items) it)
    when p_patch ? 'amount' then (p_patch->>'amount')::numeric
    else v_req.amount
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;

  update requisitions set
    requester = case when p_patch ? 'requester' then p_patch->>'requester' else requester end,
    approver = case when p_patch ? 'approver' then p_patch->>'approver' else approver end,
    department = case when p_patch ? 'department' then nullif(p_patch->>'department', '') else department end,
    items = v_items,
    amount = v_amount,
    purpose = case when p_patch ? 'purpose' then p_patch->>'purpose' else purpose end,
    category = case when p_patch ? 'category' then p_patch->>'category' else category end,
    type = case when p_patch ? 'type' then (p_patch->>'type')::requisition_type else type end,
    beneficiary_contact_id = case when p_patch ? 'beneficiary_contact_id' then nullif(p_patch->>'beneficiary_contact_id', '')::uuid else beneficiary_contact_id end,
    due_date = case when p_patch ? 'due_date' then nullif(p_patch->>'due_date', '')::date else due_date end,
    installments = case when p_patch ? 'installments' then nullif(p_patch->>'installments', '')::int else installments end,
    recovery_method = case when p_patch ? 'recovery_method' then nullif(p_patch->>'recovery_method', '') else recovery_method end
  where id = p_req_id;

  return json_build_object('id', p_req_id);
end; $function$;

create or replace function public.delete_requisition_draft(p_req_id uuid, p_org_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Só requisições pendentes podem ser apagadas (já avançou no fluxo e serve para histórico)'; end if;

  if p_org_id not in (select user_writable_org_ids()) then
    if not user_can_do(p_org_id, 'requisitions', 'edit_own_draft') then raise exception 'Sem permissão'; end if;
    if v_req.created_by is distinct from v_uid then raise exception 'Só podes apagar as tuas próprias requisições'; end if;
  end if;

  delete from requisitions where id = p_req_id;
end; $function$;

create or replace function public.reject_requisition(p_req_id uuid, p_org_id uuid, p_reason text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
  v_has_generic_write boolean;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Motivo da rejeição é obrigatório'; end if;

  v_has_generic_write := p_org_id in (select user_writable_org_ids());
  if not v_has_generic_write and not user_can_do(p_org_id, 'requisitions', 'reject') then
    raise exception 'Sem permissão';
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Requisição não está pendente'; end if;

  if not v_has_generic_write and v_req.created_by = v_uid then
    raise exception 'Não podes decidir sobre a tua própria requisição';
  end if;

  update requisitions set status = 'reprovado', reason = p_reason, decided_at = now() where id = p_req_id;
  return json_build_object('id', p_req_id, 'status', 'reprovado');
end; $function$;

create or replace function public.approve_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid, p_disburse boolean DEFAULT true)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
  v_has_generic_write boolean;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  v_has_generic_write := p_org_id in (select user_writable_org_ids());

  if p_disburse then
    -- 'disburse' NÃO se estende a este caminho: aqui a requisição ainda está
    -- 'pendente' e p_disburse=true decide E desembolsa no mesmo passo — dar
    -- isto a caixa deixaria a caixa aprovar sozinha, sem passar por
    -- aprovador nenhum. Caixa só entra por disburse_requisition, que exige
    -- 'aguardando_desembolso' (decisão do aprovador já tomada). Este
    -- atalho de um passo só fica reservado a quem já tinha confiança ampla.
    if not v_has_generic_write then raise exception 'Sem permissão'; end if;
  else
    if not v_has_generic_write and not user_can_do(p_org_id, 'requisitions', 'approve') then
      raise exception 'Sem permissão';
    end if;
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Requisição não está pendente'; end if;

  if not v_has_generic_write and v_req.created_by = v_uid then
    raise exception 'Não podes aprovar a tua própria requisição';
  end if;

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

create or replace function public.disburse_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_do(p_org_id, 'requisitions', 'disburse') then
    raise exception 'Sem permissão';
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'aguardando_desembolso' then raise exception 'Requisição não está a aguardar desembolso'; end if;

  v_eid := _disburse_requisition_ledger(v_req, p_account_id, p_org_id, v_uid);

  update requisitions set status = 'desembolsada', account_id = p_account_id, decided_at = now() where id = p_req_id;

  return json_build_object('requisition_id', p_req_id, 'status', 'desembolsada', 'entry_id', v_eid);
end; $function$;

create or replace function public.post_settlement(p_org_id uuid, p_direction settlement_direction, p_contact_id uuid, p_account_id uuid, p_allocations jsonb, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_reserve_id uuid DEFAULT NULL::uuid, p_document_kind entry_document_kind DEFAULT NULL::entry_document_kind, p_document_number text DEFAULT NULL::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_sid uuid := gen_random_uuid();
  v_num text; v_ex record;
  v_total numeric(20,2) := 0;
  v_alloc jsonb; v_ob_id uuid; v_amt numeric(20,2);
  v_ob record; v_paid numeric(20,2); v_outstanding numeric(20,2);
  v_req_dir obligation_direction := case when p_direction = 'incoming' then 'receivable' else 'payable' end;
  v_cat uuid; v_cat_type fin_category_type; v_use_cat uuid;
  v_entry_id uuid; v_desc text; v_int text;
  v_reserve record; v_consume numeric(20,2); v_new_res numeric(20,2);
  v_rate numeric := coalesce(org_tax_rate(p_org_id), 0);
  v_is_sale boolean; v_meta jsonb;
  v_doc_number text := nullif(btrim(coalesce(p_document_number, '')), '');
  v_loan_entry_type journal_entry_type;
  v_entry_num text;
  v_doc_kind obligation_document_kind;
  v_has_generic_write boolean := p_org_id in (select user_writable_org_ids());
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;

  select id, internal_number into v_ex from settlements where organization_id = p_org_id and idempotency_key = v_idem;
  if v_ex.id is not null then return json_build_object('id', v_ex.id, 'internal_number', v_ex.internal_number, 'duplicate', true); end if;

  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  if not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then raise exception 'Nenhuma obrigação alocada'; end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_ob_id := (v_alloc->>'obligation_id')::uuid;
    v_amt := (v_alloc->>'amount')::numeric;
    if v_amt is null or v_amt <= 0 then raise exception 'Valor alocado deve ser positivo'; end if;
    select * into v_ob from financial_obligations where id = v_ob_id and organization_id = p_org_id for update;
    if v_ob.id is null then raise exception 'Obrigação não encontrada nesta organização'; end if;
    if v_ob.lifecycle_status <> 'open' then raise exception 'Obrigação % não está aberta', v_ob.internal_number; end if;
    if v_ob.direction <> v_req_dir then raise exception 'Direção do pagamento não corresponde à obrigação %', v_ob.internal_number; end if;
    if v_ob.contact_id <> p_contact_id then raise exception 'Obrigação % pertence a outro contacto', v_ob.internal_number; end if;

    if not v_has_generic_write then
      if v_ob.document_kind in ('employee_loan', 'salary_advance') then
        if not user_can_do(p_org_id, 'loans', 'receive') then raise exception 'Sem permissão para pagamentos de empréstimos/adiantamentos'; end if;
      elsif p_direction = 'incoming' then
        if not user_can_do(p_org_id, 'obligations_receivable', 'receive') then raise exception 'Sem permissão nesta organização'; end if;
      else
        if not user_can_do(p_org_id, 'obligations_payable', 'settle') then raise exception 'Sem permissão nesta organização'; end if;
      end if;
    end if;

    select coalesce(sum(a.allocated_amount), 0) into v_paid
      from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted'
      where a.obligation_id = v_ob_id;
    v_outstanding := v_ob.original_amount - v_paid;
    if v_amt > v_outstanding then raise exception 'Pagamento excede saldo pendente da obrigação % (pendente %, tentado %)', v_ob.internal_number, v_outstanding, v_amt; end if;
    v_total := v_total + v_amt;
  end loop;

  if p_reserve_id is not null then
    select * into v_reserve from financial_reserves where id = p_reserve_id for update;
    if v_reserve.id is null then raise exception 'Reserva não encontrada'; end if;
    if v_reserve.organization_id <> p_org_id then raise exception 'Reserva não pertence a esta organização'; end if;
    if v_reserve.status not in ('active','partially_released') then raise exception 'Reserva não está ativa'; end if;
    if p_direction <> 'outgoing' then raise exception 'Só pagamentos a fornecedor podem consumir reservas'; end if;
    if v_reserve.obligation_id is not null and not exists (
      select 1 from jsonb_array_elements(p_allocations) e where (e->>'obligation_id')::uuid = v_reserve.obligation_id
    ) then raise exception 'A reserva está ligada a outra obrigação'; end if;
  end if;

  v_num := next_document_number(p_org_id, 'LIQ', extract(year from p_payment_date)::int);
  insert into settlements (id, organization_id, internal_number, direction, contact_id, account_id, payment_date, total_amount, payment_method, reference, notes, status, idempotency_key, created_by, document_kind, document_number)
  values (v_sid, p_org_id, v_num, p_direction, p_contact_id, p_account_id, p_payment_date, v_total, p_payment_method, p_reference, p_notes, 'posted', v_idem, v_uid, p_document_kind, v_doc_number);

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_ob_id := (v_alloc->>'obligation_id')::uuid;
    v_amt := (v_alloc->>'amount')::numeric;
    select category_id, internal_number, is_sale, document_kind into v_cat, v_int, v_is_sale, v_doc_kind from financial_obligations where id = v_ob_id;
    v_desc := case when p_direction = 'incoming' then 'Recebimento ' else 'Pagamento ' end || v_int || ' (' || v_num || ')';
    v_meta := jsonb_build_object('settlement_id', v_sid, 'obligation_id', v_ob_id, 'kind', 'settlement');

    if v_doc_kind in ('employee_loan', 'salary_advance') then
      v_loan_entry_type := case when v_doc_kind = 'salary_advance' then 'salary_advance_repayment' else 'loan_repayment' end;
      v_entry_id := gen_random_uuid();
      v_entry_num := next_entry_number(p_org_id, extract(year from p_payment_date)::int);
      insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, reference, contact_id, source, idempotency_key, created_by, metadata, document_kind, document_number)
      values (v_entry_id, p_org_id, v_entry_num, v_loan_entry_type, p_payment_date, v_desc, p_reference, p_contact_id, 'manual', gen_random_uuid(), v_uid, v_meta, p_document_kind, v_doc_number);
      insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values (p_org_id, v_entry_id, p_account_id, 'debit', v_amt);
    else
      v_use_cat := null;
      if v_cat is not null then
        select category_type into v_cat_type from financial_categories where id = v_cat;
        if p_direction = 'incoming' and v_cat_type = 'income' then v_use_cat := v_cat; end if;
        if p_direction = 'outgoing' and v_cat_type = 'expense' then v_use_cat := v_cat; end if;
      end if;
      if p_direction = 'incoming' and v_is_sale and v_rate > 0 then
        v_meta := v_meta || jsonb_build_object('is_sale', true, 'tax_amount', coalesce(org_sale_tax(p_org_id, v_amt), 0));
      end if;
      v_entry_id := _post_settlement_ledger_entry(
        p_org_id, p_account_id, v_amt, p_direction = 'incoming',
        v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, v_meta, p_document_kind, v_doc_number
      );
    end if;

    insert into settlement_allocations (organization_id, settlement_id, obligation_id, allocated_amount, journal_entry_id)
    values (p_org_id, v_sid, v_ob_id, v_amt, v_entry_id);
  end loop;

  if p_reserve_id is not null then
    v_consume := least(v_reserve.reserved_amount, v_total);
    v_new_res := v_reserve.reserved_amount - v_consume;
    update financial_reserves set
      reserved_amount = v_new_res,
      status = case when v_new_res = 0 then 'released'::reserve_status else 'partially_released'::reserve_status end,
      released_at = case when v_new_res = 0 then now() else released_at end,
      released_by = case when v_new_res = 0 then v_uid else released_by end,
      release_reason = case when v_new_res = 0 then 'Consumida no pagamento ' || v_num else release_reason end
    where id = p_reserve_id;
    insert into reserve_movements (organization_id, reserve_id, movement_type, amount, reason, settlement_id, performed_by)
    values (p_org_id, p_reserve_id, 'consume_on_payment', v_consume, 'Utilizada no pagamento ' || v_num, v_sid, v_uid);
  end if;

  return json_build_object('id', v_sid, 'internal_number', v_num, 'total', v_total, 'duplicate', false,
    'reserve_consumed', case when p_reserve_id is not null then v_consume else null end);
end; $function$;
