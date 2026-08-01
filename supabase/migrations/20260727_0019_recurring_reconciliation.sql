-- Fase 6a — recorrências e reconciliação bancária.
-- Os movimentos continuam a ser lançados no diário: estas tabelas guardam
-- apenas a programação e a evidência externa que pode ser reconciliada.

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  account_id uuid not null references accounts(id),
  transaction_kind text not null check (transaction_kind in ('income', 'expense')),
  amount numeric(20,2) not null check (amount > 0),
  description text not null check (length(trim(description)) > 0),
  category_id uuid references financial_categories(id),
  contact_id uuid references contacts(id),
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date date not null default current_date,
  next_run_date date not null,
  last_generated_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_transactions_due_idx
  on recurring_transactions (organization_id, active, next_run_date);

create table if not exists recurring_transaction_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  recurring_transaction_id uuid not null references recurring_transactions(id) on delete cascade,
  occurrence_date date not null,
  journal_entry_id uuid references journal_entries(id),
  created_at timestamptz not null default now(),
  unique (recurring_transaction_id, occurrence_date)
);

create index if not exists recurring_occurrences_org_idx
  on recurring_transaction_occurrences (organization_id, occurrence_date desc);

create table if not exists bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  account_id uuid not null references accounts(id),
  transaction_date date not null,
  amount numeric(20,2) not null check (amount > 0),
  direction text not null check (direction in ('incoming', 'outgoing')),
  description text not null default '',
  reference text,
  external_id text,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  matched_journal_entry_id uuid references journal_entries(id),
  matched_at timestamptz,
  matched_by uuid references auth.users(id),
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists bank_statement_lines_review_idx
  on bank_statement_lines (organization_id, account_id, status, transaction_date desc);
create unique index if not exists bank_statement_lines_external_idx
  on bank_statement_lines (organization_id, account_id, external_id)
  where external_id is not null and length(trim(external_id)) > 0;

alter table recurring_transactions enable row level security;
alter table recurring_transaction_occurrences enable row level security;
alter table bank_statement_lines enable row level security;

drop policy if exists recurring_transactions_select on recurring_transactions;
drop policy if exists recurring_transactions_insert on recurring_transactions;
drop policy if exists recurring_transactions_update on recurring_transactions;
create policy recurring_transactions_select on recurring_transactions
  for select to authenticated using (organization_id in (select user_org_ids()));
create policy recurring_transactions_insert on recurring_transactions
  for insert to authenticated with check (
    organization_id in (select user_writable_org_ids()) and created_by = auth.uid()
  );
create policy recurring_transactions_update on recurring_transactions
  for update to authenticated using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));

drop policy if exists recurring_occurrences_select on recurring_transaction_occurrences;
create policy recurring_occurrences_select on recurring_transaction_occurrences
  for select to authenticated using (organization_id in (select user_org_ids()));

drop policy if exists bank_statement_lines_select on bank_statement_lines;
drop policy if exists bank_statement_lines_insert on bank_statement_lines;
drop policy if exists bank_statement_lines_update on bank_statement_lines;
create policy bank_statement_lines_select on bank_statement_lines
  for select to authenticated using (organization_id in (select user_org_ids()));
create policy bank_statement_lines_insert on bank_statement_lines
  for insert to authenticated with check (
    organization_id in (select user_writable_org_ids()) and created_by = auth.uid()
  );
create policy bank_statement_lines_update on bank_statement_lines
  for update to authenticated using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));

revoke all on table recurring_transactions, recurring_transaction_occurrences, bank_statement_lines from anon, public;
grant select, insert, update on table recurring_transactions to authenticated;
grant select on table recurring_transaction_occurrences to authenticated;
grant select, insert, update on table bank_statement_lines to authenticated;

create or replace function recurring_next_date(p_frequency text, p_date date)
returns date
language plpgsql immutable
set search_path = public
as $$
begin
  if p_frequency = 'weekly' then return p_date + 7; end if;
  if p_frequency = 'monthly' then return (p_date + interval '1 month')::date; end if;
  if p_frequency = 'quarterly' then return (p_date + interval '3 months')::date; end if;
  if p_frequency = 'yearly' then return (p_date + interval '1 year')::date; end if;
  raise exception 'Frequência inválida';
end;
$$;

revoke all on function recurring_next_date(text, date) from public, anon;
grant execute on function recurring_next_date(text, date) to authenticated;

create or replace function generate_due_recurring_transactions(
  p_org_id uuid,
  p_as_of_date date default current_date
) returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rec recurring_transactions%rowtype;
  v_occurrence date;
  v_next date;
  v_meta jsonb;
  v_generated integer := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then
    raise exception 'Sem permissão nesta organização';
  end if;
  if p_as_of_date is null then raise exception 'Data de processamento inválida'; end if;

  for v_rec in
    select * from recurring_transactions
    where organization_id = p_org_id and active and next_run_date <= p_as_of_date
    order by next_run_date, created_at
    for update
  loop
    v_occurrence := v_rec.next_run_date;
    while v_occurrence <= p_as_of_date loop
      if not exists (
        select 1 from recurring_transaction_occurrences o
        where o.recurring_transaction_id = v_rec.id
          and o.occurrence_date = v_occurrence
      ) then
        v_meta := coalesce(v_rec.metadata, '{}'::jsonb) || jsonb_build_object(
          'recurring_transaction_id', v_rec.id,
          'recurring_occurrence_date', v_occurrence
        );
        if v_rec.transaction_kind = 'income' then
          perform public.post_income(
            p_org_id := p_org_id,
            p_account_id := v_rec.account_id,
            p_amount := v_rec.amount,
            p_description := v_rec.description,
            p_date := v_occurrence,
            p_category_id := v_rec.category_id,
            p_contact_id := v_rec.contact_id,
            p_metadata := v_meta
          );
        else
          perform public.post_expense(
            p_org_id := p_org_id,
            p_account_id := v_rec.account_id,
            p_amount := v_rec.amount,
            p_description := v_rec.description,
            p_date := v_occurrence,
            p_category_id := v_rec.category_id,
            p_contact_id := v_rec.contact_id,
            p_metadata := v_meta
          );
        end if;
        insert into recurring_transaction_occurrences (
          organization_id, recurring_transaction_id, occurrence_date
        ) values (p_org_id, v_rec.id, v_occurrence);
        v_generated := v_generated + 1;
      end if;
      v_next := recurring_next_date(v_rec.frequency, v_occurrence);
      update recurring_transactions
      set next_run_date = v_next, last_generated_at = now(), updated_at = now()
      where id = v_rec.id;
      v_occurrence := v_next;
    end loop;
  end loop;
  return json_build_object('generated', v_generated);
end;
$$;

revoke all on function generate_due_recurring_transactions(uuid, date) from public, anon;
grant execute on function generate_due_recurring_transactions(uuid, date) to authenticated;

create or replace function match_bank_statement_line(
  p_line_id uuid,
  p_journal_entry_id uuid
) returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_account_id uuid;
  v_amount numeric(20,2);
  v_direction text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select b.organization_id, b.account_id, b.amount, b.direction
    into v_org_id, v_account_id, v_amount, v_direction
  from bank_statement_lines b
  where b.id = p_line_id;
  if v_org_id is null then raise exception 'Linha de extrato não encontrada'; end if;
  if v_org_id not in (select user_writable_org_ids()) then
    raise exception 'Sem permissão nesta organização';
  end if;
  if not exists (
    select 1
    from journal_entries je
    join journal_lines jl on jl.journal_entry_id = je.id
    where je.id = p_journal_entry_id
      and je.organization_id = v_org_id
      and je.status = 'posted'
      and jl.account_id = v_account_id
      and round(jl.amount, 2) = round(v_amount, 2)
      and ((v_direction = 'incoming' and jl.direction = 'debit')
        or (v_direction = 'outgoing' and jl.direction = 'credit'))
  ) then
    raise exception 'O lançamento não pertence à conta ou não coincide no valor';
  end if;
  update bank_statement_lines
  set status = 'matched', matched_journal_entry_id = p_journal_entry_id,
      matched_at = now(), matched_by = v_uid
  where id = p_line_id;
  return json_build_object('matched', true, 'line_id', p_line_id, 'journal_entry_id', p_journal_entry_id);
end;
$$;

create or replace function unmatch_bank_statement_line(p_line_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_org_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select organization_id into v_org_id from bank_statement_lines where id = p_line_id;
  if v_org_id is null or v_org_id not in (select user_writable_org_ids()) then
    raise exception 'Linha de extrato não encontrada ou sem permissão';
  end if;
  update bank_statement_lines
  set status = 'unmatched', matched_journal_entry_id = null, matched_at = null, matched_by = null
  where id = p_line_id;
  return json_build_object('unmatched', true, 'line_id', p_line_id);
end;
$$;

create or replace function ignore_bank_statement_line(p_line_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_org_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select organization_id into v_org_id from bank_statement_lines where id = p_line_id;
  if v_org_id is null or v_org_id not in (select user_writable_org_ids()) then
    raise exception 'Linha de extrato não encontrada ou sem permissão';
  end if;
  update bank_statement_lines
  set status = 'ignored', matched_journal_entry_id = null, matched_at = null, matched_by = null
  where id = p_line_id;
  return json_build_object('ignored', true, 'line_id', p_line_id);
end;
$$;

revoke all on function match_bank_statement_line(uuid, uuid) from public, anon;
revoke all on function unmatch_bank_statement_line(uuid) from public, anon;
revoke all on function ignore_bank_statement_line(uuid) from public, anon;
grant execute on function match_bank_statement_line(uuid, uuid) to authenticated;
grant execute on function unmatch_bank_statement_line(uuid) to authenticated;
grant execute on function ignore_bank_statement_line(uuid) to authenticated;