-- Imposto sobre vendas nas faturas (contas a receber)
-- As contas a receber de venda (produto/serviço) passam a marcar is_sale e a
-- calcular o imposto POR DENTRO conforme o regime da empresa. No pagamento, o
-- lançamento no livro herda is_sale + imposto proporcional → o mapa fiscal e a
-- DRE de caixa passam a mostrar imposto.

alter table financial_obligations add column if not exists is_sale boolean not null default false;
alter table financial_obligations add column if not exists tax_amount numeric(20,2) not null default 0;

-- Taxa do regime (geral 14% IVA, simplificado 7%, isenção 1% selo)
create or replace function org_tax_rate(p_org_id uuid)
returns numeric language sql stable security invoker set search_path = public as $$
  select case regime
    when 'geral' then 0.14 when 'simplificado' then 0.07 when 'isencao' then 0.01 else 0 end
  from companies where organization_id = p_org_id;
$$;
revoke execute on function org_tax_rate(uuid) from public, anon;
grant execute on function org_tax_rate(uuid) to authenticated;

-- create_financial_obligation com is_sale + cálculo de imposto
drop function if exists create_financial_obligation(uuid, obligation_direction, uuid, date, numeric, obligation_document_kind, text, date, text, text, text, uuid);

create or replace function create_financial_obligation(
  p_org_id uuid, p_direction obligation_direction, p_contact_id uuid,
  p_due_date date, p_amount numeric,
  p_document_kind obligation_document_kind default 'other',
  p_external_document_number text default null,
  p_issue_date date default current_date,
  p_currency text default 'AOA', p_description text default null,
  p_notes text default null, p_category_id uuid default null,
  p_is_sale boolean default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_id uuid := gen_random_uuid(); v_num text; v_prefix text;
  v_is_sale boolean; v_rate numeric; v_tax numeric(20,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if p_due_date < p_issue_date then raise exception 'Vencimento não pode ser anterior à emissão'; end if;
  if not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = p_org_id and is_active) then raise exception 'Categoria inválida'; end if;

  -- Por omissão, uma conta a receber é uma venda (gera imposto). Pode ser desligado.
  v_is_sale := coalesce(p_is_sale, p_direction = 'receivable');
  v_rate := coalesce(org_tax_rate(p_org_id), 0);
  v_tax := case when v_is_sale and v_rate > 0 then round(p_amount - p_amount / (1 + v_rate), 2) else 0 end;

  v_prefix := case when p_direction = 'receivable' then 'REC' else 'PAG' end;
  v_num := next_document_number(p_org_id, v_prefix, extract(year from p_issue_date)::int);
  insert into financial_obligations (id, organization_id, direction, internal_number, contact_id, document_kind, external_document_number, issue_date, due_date, original_amount, currency_code, description, notes, category_id, source, created_by, is_sale, tax_amount)
  values (v_id, p_org_id, p_direction, v_num, p_contact_id, p_document_kind, p_external_document_number, p_issue_date, p_due_date, p_amount, coalesce(p_currency, 'AOA'), p_description, p_notes, p_category_id, 'manual', v_uid, v_is_sale, v_tax);
  return json_build_object('id', v_id, 'internal_number', v_num, 'is_sale', v_is_sale, 'tax_amount', v_tax);
end; $$;

revoke execute on function create_financial_obligation(uuid, obligation_direction, uuid, date, numeric, obligation_document_kind, text, date, text, text, text, uuid, boolean) from public, anon;
grant execute on function create_financial_obligation(uuid, obligation_direction, uuid, date, numeric, obligation_document_kind, text, date, text, text, text, uuid, boolean) to authenticated;

-- post_settlement: propaga is_sale + imposto proporcional para o livro (recebimentos de venda)
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
  v_rate numeric := coalesce(org_tax_rate(p_org_id), 0);
  v_is_sale boolean; v_meta jsonb;
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
  insert into settlements (id, organization_id, internal_number, direction, contact_id, account_id, payment_date, total_amount, payment_method, reference, notes, status, idempotency_key, created_by)
  values (v_sid, p_org_id, v_num, p_direction, p_contact_id, p_account_id, p_payment_date, v_total, p_payment_method, p_reference, p_notes, 'posted', v_idem, v_uid);

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_ob_id := (v_alloc->>'obligation_id')::uuid;
    v_amt := (v_alloc->>'amount')::numeric;
    select category_id, internal_number, is_sale into v_cat, v_int, v_is_sale from financial_obligations where id = v_ob_id;
    v_use_cat := null;
    if v_cat is not null then
      select category_type into v_cat_type from financial_categories where id = v_cat;
      if p_direction = 'incoming' and v_cat_type = 'income' then v_use_cat := v_cat; end if;
      if p_direction = 'outgoing' and v_cat_type = 'expense' then v_use_cat := v_cat; end if;
    end if;
    v_desc := case when p_direction = 'incoming' then 'Recebimento ' else 'Pagamento ' end || v_int || ' (' || v_num || ')';
    v_meta := jsonb_build_object('settlement_id', v_sid, 'obligation_id', v_ob_id, 'kind', 'settlement');
    -- imposto por dentro, proporcional ao valor recebido (só recebimentos de venda)
    if p_direction = 'incoming' and v_is_sale and v_rate > 0 then
      v_meta := v_meta || jsonb_build_object('is_sale', true, 'tax_amount', round(v_amt - v_amt / (1 + v_rate), 2));
    end if;
    if p_direction = 'incoming' then
      v_res := post_income(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), v_meta);
    else
      v_res := post_expense(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), v_meta);
    end if;
    v_entry_id := (v_res->>'id')::uuid;
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
end; $$;

-- Expor is_sale/tax_amount na view de estado
drop view if exists obligation_status;
create view obligation_status
with (security_invoker = true) as
select
  o.id, o.organization_id, o.direction, o.contact_id, o.internal_number,
  o.document_kind, o.external_document_number, o.issue_date, o.due_date,
  o.original_amount, o.currency_code, o.description, o.notes,
  o.lifecycle_status, o.category_id, o.created_at, o.created_by,
  o.is_sale, o.tax_amount,
  coalesce(p.paid, 0)::numeric(20,2) as paid_amount,
  (o.original_amount - coalesce(p.paid, 0))::numeric(20,2) as outstanding_amount,
  case
    when o.lifecycle_status = 'open' and (o.original_amount - coalesce(p.paid, 0)) > 0 and o.due_date < current_date
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

grant select on obligation_status to authenticated;
