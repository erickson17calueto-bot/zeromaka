-- Fase 3b — RPCs atómicas + view de estado calculado
-- Funções SECURITY DEFINER (verificam auth + permissão internamente) para que
-- settlements/allocations/obligations só sejam escritos por lógica validada.
-- A view usa security_invoker para respeitar a RLS das tabelas subjacentes.

-- ---------- View: estado financeiro calculado ----------
create or replace view obligation_status
with (security_invoker = true) as
select
  o.id, o.organization_id, o.direction, o.contact_id, o.internal_number,
  o.document_kind, o.external_document_number, o.issue_date, o.due_date,
  o.original_amount, o.currency_code, o.description, o.notes,
  o.lifecycle_status, o.category_id, o.created_at, o.created_by,
  coalesce(p.paid, 0)::numeric(20,2) as paid_amount,
  (o.original_amount - coalesce(p.paid, 0))::numeric(20,2) as outstanding_amount,
  case
    when o.lifecycle_status = 'open'
     and (o.original_amount - coalesce(p.paid, 0)) > 0
     and o.due_date < current_date
    then (current_date - o.due_date) else 0
  end as days_overdue,
  case
    when o.lifecycle_status = 'cancelled' then 'cancelled'
    when (o.original_amount - coalesce(p.paid, 0)) <= 0 then 'paid'
    else case
      when o.due_date < current_date and coalesce(p.paid, 0) > 0 then 'partial_overdue'
      when o.due_date < current_date then 'overdue'
      when o.due_date = current_date then 'due_today'
      when coalesce(p.paid, 0) > 0 then 'partial'
      else 'open'
    end
  end as financial_status
from financial_obligations o
left join (
  select a.obligation_id, sum(a.allocated_amount) as paid
  from settlement_allocations a
  join settlements s on s.id = a.settlement_id and s.status = 'posted'
  group by a.obligation_id
) p on p.obligation_id = o.id;

-- ---------- create_financial_obligation ----------
create or replace function create_financial_obligation(
  p_org_id uuid, p_direction obligation_direction, p_contact_id uuid,
  p_due_date date, p_amount numeric,
  p_document_kind obligation_document_kind default 'other',
  p_external_document_number text default null,
  p_issue_date date default current_date,
  p_currency text default 'AOA', p_description text default null,
  p_notes text default null, p_category_id uuid default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id uuid := gen_random_uuid(); v_num text; v_prefix text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if p_due_date < p_issue_date then raise exception 'Vencimento não pode ser anterior à emissão'; end if;
  if not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = p_org_id and is_active) then raise exception 'Categoria inválida'; end if;
  v_prefix := case when p_direction = 'receivable' then 'REC' else 'PAG' end;
  v_num := next_document_number(p_org_id, v_prefix, extract(year from p_issue_date)::int);
  insert into financial_obligations (id, organization_id, direction, internal_number, contact_id, document_kind, external_document_number, issue_date, due_date, original_amount, currency_code, description, notes, category_id, source, created_by)
  values (v_id, p_org_id, p_direction, v_num, p_contact_id, p_document_kind, p_external_document_number, p_issue_date, p_due_date, p_amount, coalesce(p_currency, 'AOA'), p_description, p_notes, p_category_id, 'manual', v_uid);
  return json_build_object('id', v_id, 'internal_number', v_num);
end; $$;

-- ---------- post_settlement (atómica) ----------
create or replace function post_settlement(
  p_org_id uuid, p_direction settlement_direction, p_contact_id uuid, p_account_id uuid,
  p_allocations jsonb, p_payment_date date default current_date,
  p_payment_method text default null, p_reference text default null,
  p_notes text default null, p_idempotency_key uuid default null
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
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;

  select id, internal_number into v_ex from settlements where organization_id = p_org_id and idempotency_key = v_idem;
  if v_ex.id is not null then return json_build_object('id', v_ex.id, 'internal_number', v_ex.internal_number, 'duplicate', true); end if;

  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  if not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then raise exception 'Nenhuma obrigação alocada'; end if;

  -- validar + bloquear cada obrigação (FOR UPDATE) e acumular total
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

  v_num := next_document_number(p_org_id, 'LIQ', extract(year from p_payment_date)::int);
  insert into settlements (id, organization_id, internal_number, direction, contact_id, account_id, payment_date, total_amount, payment_method, reference, notes, status, idempotency_key, created_by)
  values (v_sid, p_org_id, v_num, p_direction, p_contact_id, p_account_id, p_payment_date, v_total, p_payment_method, p_reference, p_notes, 'posted', v_idem, v_uid);

  -- alocações + movimentos no livro (um por alocação, ligado)
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

  return json_build_object('id', v_sid, 'internal_number', v_num, 'total', v_total, 'duplicate', false);
end; $$;

-- ---------- reverse_settlement ----------
create or replace function reverse_settlement(p_settlement_id uuid, p_reason text)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_s record; v_a record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_s from settlements where id = p_settlement_id;
  if v_s.id is null then raise exception 'Liquidação não encontrada'; end if;
  if v_s.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_s.status <> 'posted' then raise exception 'Liquidação já revertida'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Motivo obrigatório'; end if;
  for v_a in select * from settlement_allocations where settlement_id = p_settlement_id loop
    if v_a.journal_entry_id is not null then
      perform reverse_journal_entry(v_a.journal_entry_id, p_reason);
    end if;
  end loop;
  update settlements set status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason where id = p_settlement_id;
  return json_build_object('id', p_settlement_id, 'reversed', true);
end; $$;

-- ---------- cancel_obligation ----------
create or replace function cancel_obligation(p_obligation_id uuid, p_reason text)
returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_o record; v_paid numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_o from financial_obligations where id = p_obligation_id;
  if v_o.id is null then raise exception 'Obrigação não encontrada'; end if;
  if v_o.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_o.lifecycle_status <> 'open' then raise exception 'Obrigação não está aberta'; end if;
  select coalesce(sum(a.allocated_amount), 0) into v_paid from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted' where a.obligation_id = p_obligation_id;
  if v_paid > 0 then raise exception 'Não é possível cancelar uma obrigação com pagamentos. Reverta os pagamentos primeiro.'; end if;
  update financial_obligations set lifecycle_status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid, cancellation_reason = p_reason where id = p_obligation_id;
  return json_build_object('id', p_obligation_id, 'cancelled', true);
end; $$;

-- ---------- update_obligation ----------
create or replace function update_obligation(
  p_obligation_id uuid, p_contact_id uuid default null, p_description text default null,
  p_external_document_number text default null, p_amount numeric default null,
  p_issue_date date default null, p_due_date date default null,
  p_category_id uuid default null, p_notes text default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_o record; v_paid numeric; v_new_issue date; v_new_due date; v_new_amount numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_o from financial_obligations where id = p_obligation_id;
  if v_o.id is null then raise exception 'Obrigação não encontrada'; end if;
  if v_o.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_o.lifecycle_status <> 'open' then raise exception 'Obrigação cancelada não pode ser alterada'; end if;
  select coalesce(sum(a.allocated_amount), 0) into v_paid from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted' where a.obligation_id = p_obligation_id;
  v_new_amount := coalesce(p_amount, v_o.original_amount);
  v_new_issue := coalesce(p_issue_date, v_o.issue_date);
  v_new_due := coalesce(p_due_date, v_o.due_date);
  if v_paid > 0 then
    if p_amount is not null and p_amount < v_paid then raise exception 'Valor não pode ser inferior ao já pago (%)', v_paid; end if;
    if p_contact_id is not null and p_contact_id <> v_o.contact_id then raise exception 'Não é possível trocar o contacto após pagamentos'; end if;
  end if;
  if p_contact_id is not null and not exists (select 1 from contacts where id = p_contact_id and organization_id = v_o.organization_id) then raise exception 'Contacto inválido'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = v_o.organization_id) then raise exception 'Categoria inválida'; end if;
  if v_new_due < v_new_issue then raise exception 'Vencimento não pode ser anterior à emissão'; end if;
  if v_new_amount <= 0 then raise exception 'Valor deve ser positivo'; end if;
  update financial_obligations set
    contact_id = coalesce(p_contact_id, contact_id),
    description = coalesce(p_description, description),
    external_document_number = coalesce(p_external_document_number, external_document_number),
    original_amount = v_new_amount,
    issue_date = v_new_issue,
    due_date = v_new_due,
    category_id = coalesce(p_category_id, category_id),
    notes = coalesce(p_notes, notes)
  where id = p_obligation_id;
  return json_build_object('id', p_obligation_id, 'updated', true);
end; $$;
