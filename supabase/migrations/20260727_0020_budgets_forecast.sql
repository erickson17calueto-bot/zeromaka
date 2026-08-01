-- Fase 6b — orçamentos e previsão de caixa.
-- A previsão é uma projeção explícita; não altera o diário nem o saldo real.

create table if not exists cash_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null check (length(trim(name)) > 0),
  direction text not null check (direction in ('income', 'expense')),
  category_id uuid references financial_categories(id),
  account_id uuid references accounts(id),
  period_start date not null,
  period_end date not null,
  planned_amount numeric(20,2) not null check (planned_amount >= 0),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create index if not exists cash_budgets_period_idx
  on cash_budgets (organization_id, period_start, period_end, active);

alter table cash_budgets enable row level security;
drop policy if exists cash_budgets_select on cash_budgets;
drop policy if exists cash_budgets_insert on cash_budgets;
drop policy if exists cash_budgets_update on cash_budgets;
drop policy if exists cash_budgets_delete on cash_budgets;
create policy cash_budgets_select on cash_budgets
  for select to authenticated using (organization_id in (select user_org_ids()));
create policy cash_budgets_insert on cash_budgets
  for insert to authenticated with check (
    organization_id in (select user_writable_org_ids()) and created_by = auth.uid()
  );
create policy cash_budgets_update on cash_budgets
  for update to authenticated using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));
create policy cash_budgets_delete on cash_budgets
  for delete to authenticated using (organization_id in (select user_writable_org_ids()));

revoke all on table cash_budgets from anon, public;
grant select, insert, update, delete on table cash_budgets to authenticated;

create or replace function get_cash_forecast(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_account_id uuid default null
) returns json
language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_opening numeric := 0;
  v_actual_in numeric := 0;
  v_actual_out numeric := 0;
  v_scheduled_in numeric := 0;
  v_scheduled_out numeric := 0;
  v_receivables numeric := 0;
  v_payables numeric := 0;
  v_daily json;
  v_budgets json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;
  if p_account_id is not null and not exists (
    select 1 from accounts a where a.id = p_account_id and a.organization_id = p_org_id
  ) then raise exception 'Conta não encontrada nesta organização'; end if;

  select coalesce(sum(case when jl.direction = 'debit' then jl.amount else -jl.amount end), 0)
    into v_opening
  from journal_entries je
  join journal_lines jl on jl.journal_entry_id = je.id
  where je.organization_id = p_org_id
    and je.transaction_date < p_start
    and (p_account_id is null or jl.account_id = p_account_id);

  select coalesce(sum(case when jl.direction = 'debit' then jl.amount else 0 end), 0),
         coalesce(sum(case when jl.direction = 'credit' then jl.amount else 0 end), 0)
    into v_actual_in, v_actual_out
  from journal_entries je
  join journal_lines jl on jl.journal_entry_id = je.id
  where je.organization_id = p_org_id
    and je.transaction_date between p_start and p_end
    and (p_account_id is null or jl.account_id = p_account_id);

  select coalesce(sum(case when transaction_kind = 'income' then amount else 0 end), 0),
         coalesce(sum(case when transaction_kind = 'expense' then amount else 0 end), 0)
    into v_scheduled_in, v_scheduled_out
  from recurring_transactions
  where organization_id = p_org_id and active
    and next_run_date between p_start and p_end
    and (p_account_id is null or account_id = p_account_id);

  select coalesce(sum(case when direction = 'receivable' then outstanding_amount else 0 end), 0),
         coalesce(sum(case when direction = 'payable' then outstanding_amount else 0 end), 0)
    into v_receivables, v_payables
  from obligation_status
  where organization_id = p_org_id
    and due_date between p_start and p_end
    and financial_status not in ('cancelled', 'paid')
    and (p_account_id is null or true);

  select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json)
    into v_daily
  from (
    select days.day::date as day,
      coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
        where je.organization_id = p_org_id and je.transaction_date = days.day::date
          and jl.direction = 'debit' and (p_account_id is null or jl.account_id = p_account_id)), 0) as actual_inflows,
      coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
        where je.organization_id = p_org_id and je.transaction_date = days.day::date
          and jl.direction = 'credit' and (p_account_id is null or jl.account_id = p_account_id)), 0) as actual_outflows,
      coalesce((select sum(rt.amount) from recurring_transactions rt
        where rt.organization_id = p_org_id and rt.active and rt.next_run_date = days.day::date
          and rt.transaction_kind = 'income' and (p_account_id is null or rt.account_id = p_account_id)), 0) as scheduled_inflows,
      coalesce((select sum(rt.amount) from recurring_transactions rt
        where rt.organization_id = p_org_id and rt.active and rt.next_run_date = days.day::date
          and rt.transaction_kind = 'expense' and (p_account_id is null or rt.account_id = p_account_id)), 0) as scheduled_outflows
    from generate_series(p_start, p_end, interval '1 day') days(day)
  ) d;

  select coalesce(json_agg(row_to_json(b) order by b.period_start), '[]'::json)
    into v_budgets
  from (
    select cb.id, cb.name, cb.direction, cb.category_id, cb.account_id,
      cb.period_start, cb.period_end, cb.planned_amount, cb.note
    from cash_budgets cb
    where cb.organization_id = p_org_id and cb.active
      and cb.period_start <= p_end and cb.period_end >= p_start
      and (p_account_id is null or cb.account_id is null or cb.account_id = p_account_id)
  ) b;

  return json_build_object(
    'organization_id', p_org_id,
    'start_date', p_start,
    'end_date', p_end,
    'opening_balance', v_opening,
    'actual_inflows', v_actual_in,
    'actual_outflows', v_actual_out,
    'scheduled_inflows', v_scheduled_in,
    'scheduled_outflows', v_scheduled_out,
    'receivables_due', v_receivables,
    'payables_due', v_payables,
    'projected_closing_balance', v_opening + v_actual_in - v_actual_out + v_scheduled_in - v_scheduled_out + v_receivables - v_payables,
    'daily', v_daily,
    'budgets', v_budgets
  );
end;
$$;

revoke all on function get_cash_forecast(uuid, date, date, uuid) from public, anon;
grant execute on function get_cash_forecast(uuid, date, date, uuid) to authenticated;