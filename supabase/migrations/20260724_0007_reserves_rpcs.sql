-- Fase 4b — RPCs de reservas + get_true_available_cash + consumo de reserva no pagamento
-- Mutações: SECURITY DEFINER com validação interna (padrão da Fase 3).
-- Cálculo: get_true_available_cash em SECURITY INVOKER — corre com os direitos
-- do utilizador e respeita a RLS; nada é calculado no frontend.

-- ---------- create_reserve ----------
create or replace function create_reserve(
  p_org_id uuid, p_category_id uuid, p_name text, p_amount numeric,
  p_reserve_type reserve_type default 'general',
  p_account_id uuid default null, p_obligation_id uuid default null,
  p_target_amount numeric default null, p_target_date date default null,
  p_priority reserve_priority default 'normal', p_description text default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id uuid := gen_random_uuid(); v_ob record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor da reserva deve ser positivo'; end if;
  if not exists (select 1 from reserve_categories where id = p_category_id and organization_id = p_org_id and is_active) then raise exception 'Categoria de reserva inválida'; end if;
  if p_reserve_type = 'account_specific' then
    if p_account_id is null then raise exception 'Reserva por conta exige uma conta'; end if;
    if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id) then raise exception 'Conta não pertence a esta organização'; end if;
  end if;
  if p_reserve_type = 'obligation_linked' then
    if p_obligation_id is null then raise exception 'Reserva ligada exige uma obrigação'; end if;
    select * into v_ob from financial_obligations where id = p_obligation_id and organization_id = p_org_id;
    if v_ob.id is null then raise exception 'Obrigação não pertence a esta organização'; end if;
    if v_ob.direction <> 'payable' then raise exception 'Só é possível ligar reservas a contas a pagar'; end if;
    if v_ob.lifecycle_status <> 'open' then raise exception 'Obrigação não está aberta'; end if;
  end if;
  insert into financial_reserves (id, organization_id, category_id, name, description, reserve_type, account_id, obligation_id, target_amount, reserved_amount, target_date, priority, created_by)
  values (v_id, p_org_id, p_category_id, p_name, p_description, p_reserve_type,
          case when p_reserve_type = 'account_specific' then p_account_id else null end,
          case when p_reserve_type = 'obligation_linked' then p_obligation_id else null end,
          p_target_amount, p_amount, p_target_date, p_priority, v_uid);
  insert into reserve_movements (organization_id, reserve_id, movement_type, amount, reason, performed_by)
  values (p_org_id, v_id, 'create', p_amount, 'Criação da reserva', v_uid);
  return json_build_object('id', v_id);
end; $$;

-- ---------- increase_reserve ----------
create or replace function increase_reserve(p_reserve_id uuid, p_amount numeric, p_reason text default null)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_r record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_r from financial_reserves where id = p_reserve_id for update;
  if v_r.id is null then raise exception 'Reserva não encontrada'; end if;
  if v_r.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_r.status not in ('active','partially_released') then raise exception 'Reserva não está ativa'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  update financial_reserves set reserved_amount = reserved_amount + p_amount, status = 'active' where id = p_reserve_id;
  insert into reserve_movements (organization_id, reserve_id, movement_type, amount, reason, performed_by)
  values (v_r.organization_id, p_reserve_id, 'increase', p_amount, p_reason, v_uid);
  return json_build_object('id', p_reserve_id, 'reserved_amount', v_r.reserved_amount + p_amount);
end; $$;

-- ---------- release_reserve (parcial ou total; crítica só owner/admin) ----------
create or replace function release_reserve(p_reserve_id uuid, p_amount numeric, p_reason text)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_r record; v_new numeric(20,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Motivo obrigatório'; end if;
  select * into v_r from financial_reserves where id = p_reserve_id for update;
  if v_r.id is null then raise exception 'Reserva não encontrada'; end if;
  if v_r.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_r.status not in ('active','partially_released') then raise exception 'Reserva não está ativa'; end if;
  if v_r.priority = 'critical' and v_r.organization_id not in (select user_admin_org_ids()) then
    raise exception 'Só owner ou admin podem libertar reservas críticas';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if p_amount > v_r.reserved_amount then raise exception 'Não é possível libertar mais do que o valor reservado (%)', v_r.reserved_amount; end if;
  v_new := v_r.reserved_amount - p_amount;
  update financial_reserves set
    reserved_amount = v_new,
    status = case when v_new = 0 then 'released'::reserve_status else 'partially_released'::reserve_status end,
    released_at = case when v_new = 0 then now() else released_at end,
    released_by = case when v_new = 0 then v_uid else released_by end,
    release_reason = case when v_new = 0 then p_reason else release_reason end
  where id = p_reserve_id;
  insert into reserve_movements (organization_id, reserve_id, movement_type, amount, reason, performed_by)
  values (v_r.organization_id, p_reserve_id, 'release', p_amount, p_reason, v_uid);
  return json_build_object('id', p_reserve_id, 'reserved_amount', v_new, 'released', v_new = 0);
end; $$;

-- ---------- cancel_reserve ----------
create or replace function cancel_reserve(p_reserve_id uuid, p_reason text)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_r record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Motivo obrigatório'; end if;
  select * into v_r from financial_reserves where id = p_reserve_id for update;
  if v_r.id is null then raise exception 'Reserva não encontrada'; end if;
  if v_r.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_r.status not in ('active','partially_released') then raise exception 'Reserva não está ativa'; end if;
  if v_r.priority = 'critical' and v_r.organization_id not in (select user_admin_org_ids()) then
    raise exception 'Só owner ou admin podem cancelar reservas críticas';
  end if;
  update financial_reserves set status = 'cancelled', reserved_amount = 0,
    released_at = now(), released_by = v_uid, release_reason = p_reason
  where id = p_reserve_id;
  if v_r.reserved_amount > 0 then
    insert into reserve_movements (organization_id, reserve_id, movement_type, amount, reason, performed_by)
    values (v_r.organization_id, p_reserve_id, 'cancel', v_r.reserved_amount, p_reason, v_uid);
  end if;
  return json_build_object('id', p_reserve_id, 'cancelled', true);
end; $$;

-- ---------- update_financial_settings (owner/admin) ----------
create or replace function update_financial_settings(
  p_org_id uuid,
  p_horizon_days int default null,
  p_include_overdue boolean default null,
  p_include_requisitions boolean default null,
  p_include_archived boolean default null,
  p_minimum_cash_buffer numeric default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Só owner ou admin podem alterar configurações financeiras'; end if;
  if p_horizon_days is not null and p_horizon_days not in (7, 15, 30) then raise exception 'Horizonte deve ser 7, 15 ou 30 dias'; end if;
  if p_minimum_cash_buffer is not null and p_minimum_cash_buffer < 0 then raise exception 'Reserva mínima não pode ser negativa'; end if;
  insert into organization_financial_settings (organization_id, default_commitment_horizon_days, include_overdue_payables, include_approved_requisitions, include_archived_accounts, minimum_cash_buffer, updated_by)
  values (p_org_id, coalesce(p_horizon_days, 7), coalesce(p_include_overdue, true), coalesce(p_include_requisitions, true), coalesce(p_include_archived, false), coalesce(p_minimum_cash_buffer, 0), v_uid)
  on conflict (organization_id) do update set
    default_commitment_horizon_days = coalesce(p_horizon_days, organization_financial_settings.default_commitment_horizon_days),
    include_overdue_payables = coalesce(p_include_overdue, organization_financial_settings.include_overdue_payables),
    include_approved_requisitions = coalesce(p_include_requisitions, organization_financial_settings.include_approved_requisitions),
    include_archived_accounts = coalesce(p_include_archived, organization_financial_settings.include_archived_accounts),
    minimum_cash_buffer = coalesce(p_minimum_cash_buffer, organization_financial_settings.minimum_cash_buffer),
    updated_by = v_uid, updated_at = now();
  return json_build_object('ok', true);
end; $$;

-- ---------- get_true_available_cash (SECURITY INVOKER — respeita RLS) ----------
create or replace function get_true_available_cash(
  p_org_id uuid, p_horizon_days int default null, p_account_id uuid default null
) returns json
language plpgsql security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_horizon int; v_horizon_end date;
  v_include_overdue boolean; v_include_reqs boolean; v_include_archived boolean;
  v_buffer numeric(20,2);
  v_balance numeric(20,2); v_reserves numeric(20,2);
  v_overdue_pay numeric(20,2); v_upcoming_pay numeric(20,2);
  v_covered numeric(20,2); v_uncovered numeric(20,2);
  v_reqs numeric(20,2); v_result numeric(20,2);
  v_accounts json; v_reserves_detail json; v_obligations_detail json; v_reqs_detail json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id) then
    raise exception 'Conta não pertence a esta organização';
  end if;

  select coalesce(s.default_commitment_horizon_days, 7),
         coalesce(s.include_overdue_payables, true),
         coalesce(s.include_approved_requisitions, true),
         coalesce(s.include_archived_accounts, false),
         coalesce(s.minimum_cash_buffer, 0)
  into v_horizon, v_include_overdue, v_include_reqs, v_include_archived, v_buffer
  from (select 1) x left join organization_financial_settings s on s.organization_id = p_org_id;

  if p_horizon_days is not null then
    if p_horizon_days not in (7, 15, 30) then raise exception 'Horizonte deve ser 7, 15 ou 30 dias'; end if;
    v_horizon := p_horizon_days;
  end if;
  v_horizon_end := current_date + v_horizon;

  -- Saldo atual: livro da Fase 2. Arquivadas: só se configurado ou se ainda têm saldo.
  with acc_bal as (
    select a.id, a.name, a.is_archived,
           coalesce(sum(case when jl.direction = 'debit' then jl.amount else -jl.amount end), 0)::numeric(20,2) as balance
    from accounts a
    left join journal_lines jl on jl.account_id = a.id
    where a.organization_id = p_org_id
      and (p_account_id is null or a.id = p_account_id)
    group by a.id, a.name, a.is_archived
  ), acc_inc as (
    select * from acc_bal where not is_archived or v_include_archived or balance <> 0
  )
  select coalesce(sum(balance), 0),
         coalesce(json_agg(json_build_object('id', id, 'name', name, 'balance', balance, 'archived', is_archived)), '[]'::json)
  into v_balance, v_accounts
  from acc_inc;

  -- Reservas ativas (por conta: filtradas quando p_account_id é dado; gerais contam sempre no total da org)
  select coalesce(sum(reserved_amount), 0),
         coalesce(json_agg(json_build_object('id', id, 'name', name, 'amount', reserved_amount, 'priority', priority, 'type', reserve_type, 'obligation_id', obligation_id)), '[]'::json)
  into v_reserves, v_reserves_detail
  from financial_reserves
  where organization_id = p_org_id
    and status in ('active','partially_released')
    and reserved_amount > 0
    and (p_account_id is null or account_id is null or account_id = p_account_id);

  -- Compromissos: payables abertas com pendente, no horizonte (+ vencidas se configurado).
  -- Cobertura: reservas ativas ligadas à obrigação, limitadas ao pendente (sem dupla contagem).
  with pay as (
    select os.id, os.internal_number, os.due_date, os.outstanding_amount,
           (os.due_date < current_date) as is_overdue,
           least(os.outstanding_amount, coalesce((
             select sum(r.reserved_amount) from financial_reserves r
             where r.obligation_id = os.id and r.status in ('active','partially_released')
           ), 0))::numeric(20,2) as covered
    from obligation_status os
    where os.organization_id = p_org_id
      and os.direction = 'payable'
      and os.lifecycle_status = 'open'
      and os.outstanding_amount > 0
      and (
        (os.due_date >= current_date and os.due_date <= v_horizon_end)
        or (v_include_overdue and os.due_date < current_date)
      )
  )
  select coalesce(sum(outstanding_amount) filter (where is_overdue), 0),
         coalesce(sum(outstanding_amount) filter (where not is_overdue), 0),
         coalesce(sum(covered), 0),
         coalesce(sum(outstanding_amount - covered), 0),
         coalesce(json_agg(json_build_object('id', id, 'number', internal_number, 'due_date', due_date, 'outstanding', outstanding_amount, 'covered', covered, 'uncovered', outstanding_amount - covered, 'overdue', is_overdue)), '[]'::json)
  into v_overdue_pay, v_upcoming_pay, v_covered, v_uncovered, v_obligations_detail
  from pay;

  -- Requisições aprovadas ainda sem lançamento no livro (hoje = 0 por desenho: aprovar lança de imediato)
  if v_include_reqs then
    select coalesce(sum(r.amount), 0),
           coalesce(json_agg(json_build_object('id', r.id, 'number', r.number, 'amount', r.amount)), '[]'::json)
    into v_reqs, v_reqs_detail
    from requisitions r
    where r.organization_id = p_org_id
      and r.status = 'aprovado'
      and not exists (
        select 1 from journal_entries je
        where je.organization_id = p_org_id
          and je.metadata->>'requisition_id' = r.id::text
          and je.status = 'posted'
      );
  else
    v_reqs := 0; v_reqs_detail := '[]'::json;
  end if;

  v_result := v_balance - v_reserves - v_uncovered - v_reqs - v_buffer;

  return json_build_object(
    'current_cash_balance', v_balance,
    'active_reserves_total', v_reserves,
    'minimum_cash_buffer', v_buffer,
    'overdue_payables_total', v_overdue_pay,
    'upcoming_payables_total', v_upcoming_pay,
    'approved_requisitions_total', v_reqs,
    'covered_obligations_total', v_covered,
    'uncovered_commitments_total', v_uncovered,
    'true_available_cash', v_result,
    'calculation_date', current_date,
    'horizon_days', v_horizon,
    'horizon_end_date', v_horizon_end,
    'safety_state', case
      when v_result <= 0 then 'critical'
      when v_balance > 0 and v_result < v_balance * 0.2 then 'warning'
      else 'safe'
    end,
    'breakdown', json_build_object(
      'accounts', v_accounts,
      'reserves', v_reserves_detail,
      'obligations', v_obligations_detail,
      'requisitions', v_reqs_detail
    )
  );
end; $$;

-- ---------- post_settlement com consumo opcional de reserva ----------
-- Substitui a assinatura da Fase 3 acrescentando p_reserve_id (default null).
drop function if exists post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid);

create or replace function post_settlement(
  p_org_id uuid, p_direction settlement_direction, p_contact_id uuid, p_account_id uuid,
  p_allocations jsonb, p_payment_date date default current_date,
  p_payment_method text default null, p_reference text default null,
  p_notes text default null, p_idempotency_key uuid default null,
  p_reserve_id uuid default null
) returns json
language plpgsql security definer set search_path = public
as $$
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
  v_res json; v_entry_id uuid; v_desc text; v_int text;
  v_reserve record; v_consume numeric(20,2); v_new_res numeric(20,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;

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
    select coalesce(sum(a.allocated_amount), 0) into v_paid
      from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted'
      where a.obligation_id = v_ob_id;
    v_outstanding := v_ob.original_amount - v_paid;
    if v_amt > v_outstanding then raise exception 'Pagamento excede saldo pendente da obrigação % (pendente %, tentado %)', v_ob.internal_number, v_outstanding, v_amt; end if;
    v_total := v_total + v_amt;
  end loop;

  -- Reserva a consumir (opcional): validar ANTES de escrever
  if p_reserve_id is not null then
    select * into v_reserve from financial_reserves where id = p_reserve_id for update;
    if v_reserve.id is null then raise exception 'Reserva não encontrada'; end if;
    if v_reserve.organization_id <> p_org_id then raise exception 'Reserva não pertence a esta organização'; end if;
    if v_reserve.status not in ('active','partially_released') then raise exception 'Reserva não está ativa'; end if;
    if p_direction <> 'outgoing' then raise exception 'Só pagamentos a fornecedor podem consumir reservas'; end if;
    -- reserva ligada: a obrigação ligada tem de estar entre as alocações deste pagamento
    if v_reserve.obligation_id is not null and not exists (
      select 1 from jsonb_array_elements(p_allocations) e
      where (e->>'obligation_id')::uuid = v_reserve.obligation_id
    ) then raise exception 'A reserva está ligada a outra obrigação'; end if;
  end if;

  v_num := next_document_number(p_org_id, 'LIQ', extract(year from p_payment_date)::int);
  insert into settlements (id, organization_id, internal_number, direction, contact_id, account_id, payment_date, total_amount, payment_method, reference, notes, status, idempotency_key, created_by)
  values (v_sid, p_org_id, v_num, p_direction, p_contact_id, p_account_id, p_payment_date, v_total, p_payment_method, p_reference, p_notes, 'posted', v_idem, v_uid);

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_ob_id := (v_alloc->>'obligation_id')::uuid;
    v_amt := (v_alloc->>'amount')::numeric;
    select category_id, internal_number into v_cat, v_int from financial_obligations where id = v_ob_id;
    v_use_cat := null;
    if v_cat is not null then
      select category_type into v_cat_type from financial_categories where id = v_cat;
      if p_direction = 'incoming' and v_cat_type = 'income' then v_use_cat := v_cat; end if;
      if p_direction = 'outgoing' and v_cat_type = 'expense' then v_use_cat := v_cat; end if;
    end if;
    v_desc := case when p_direction = 'incoming' then 'Recebimento ' else 'Pagamento ' end || v_int || ' (' || v_num || ')';
    if p_direction = 'incoming' then
      v_res := post_income(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), jsonb_build_object('settlement_id', v_sid, 'obligation_id', v_ob_id, 'kind', 'settlement'));
    else
      v_res := post_expense(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), jsonb_build_object('settlement_id', v_sid, 'obligation_id', v_ob_id, 'kind', 'settlement'));
    end if;
    v_entry_id := (v_res->>'id')::uuid;
    insert into settlement_allocations (organization_id, settlement_id, obligation_id, allocated_amount, journal_entry_id)
    values (p_org_id, v_sid, v_ob_id, v_amt, v_entry_id);
  end loop;

  -- Consumir a reserva atomicamente com o pagamento
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
end; $$;

-- ---------- GRANTs ----------
revoke execute on function create_reserve(uuid, uuid, text, numeric, reserve_type, uuid, uuid, numeric, date, reserve_priority, text) from public, anon;
revoke execute on function increase_reserve(uuid, numeric, text) from public, anon;
revoke execute on function release_reserve(uuid, numeric, text) from public, anon;
revoke execute on function cancel_reserve(uuid, text) from public, anon;
revoke execute on function update_financial_settings(uuid, int, boolean, boolean, boolean, numeric) from public, anon;
revoke execute on function get_true_available_cash(uuid, int, uuid) from public, anon;
revoke execute on function post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid, uuid) from public, anon;

grant execute on function create_reserve(uuid, uuid, text, numeric, reserve_type, uuid, uuid, numeric, date, reserve_priority, text) to authenticated;
grant execute on function increase_reserve(uuid, numeric, text) to authenticated;
grant execute on function release_reserve(uuid, numeric, text) to authenticated;
grant execute on function cancel_reserve(uuid, text) to authenticated;
grant execute on function update_financial_settings(uuid, int, boolean, boolean, boolean, numeric) to authenticated;
grant execute on function get_true_available_cash(uuid, int, uuid) to authenticated;
grant execute on function post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid, uuid) to authenticated;
