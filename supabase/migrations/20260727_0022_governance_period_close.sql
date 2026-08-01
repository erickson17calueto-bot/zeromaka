-- Fase 6d — governação, auditoria e fecho de períodos.
-- O fecho é aplicado no servidor por trigger: esconder botões no frontend não chega.

create table if not exists accounting_period_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'reopened')),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, period_start, period_end),
  check (period_start <= period_end)
);

create index if not exists accounting_period_closures_lookup_idx
  on accounting_period_closures (organization_id, period_start, period_end, status);

alter table accounting_period_closures enable row level security;
drop policy if exists accounting_period_closures_select on accounting_period_closures;
create policy accounting_period_closures_select on accounting_period_closures
  for select to authenticated using (organization_id in (select user_org_ids()));
revoke all on table accounting_period_closures from anon, public;
grant select on table accounting_period_closures to authenticated;

create or replace function enforce_open_accounting_period()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from accounting_period_closures c
    where c.organization_id = new.organization_id
      and c.status = 'closed'
      and new.transaction_date between c.period_start and c.period_end
  ) then
    raise exception 'O período contabilístico de % a % está fechado',
      (select c.period_start from accounting_period_closures c where c.organization_id = new.organization_id and c.status = 'closed' and new.transaction_date between c.period_start and c.period_end order by c.period_start desc limit 1),
      (select c.period_end from accounting_period_closures c where c.organization_id = new.organization_id and c.status = 'closed' and new.transaction_date between c.period_start and c.period_end order by c.period_start desc limit 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_entries_open_period on journal_entries;
create trigger trg_journal_entries_open_period
  before insert or update on journal_entries
  for each row execute function enforce_open_accounting_period();
revoke all on function enforce_open_accounting_period() from public, anon, authenticated;

create or replace function close_accounting_period(
  p_org_id uuid, p_start date, p_end date, p_note text default null
) returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Só owner ou admin podem fechar períodos'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;
  select to_jsonb(c), c.id into v_old, v_id
  from accounting_period_closures c
  where c.organization_id = p_org_id and c.period_start = p_start and c.period_end = p_end;
  if v_id is null then
    insert into accounting_period_closures (organization_id, period_start, period_end, status, closed_by, closed_at, note)
    values (p_org_id, p_start, p_end, 'closed', v_uid, now(), p_note)
    returning id into v_id;
  else
    update accounting_period_closures
    set status = 'closed', closed_by = v_uid, closed_at = now(), reopened_by = null, reopened_at = null,
        note = coalesce(p_note, note), updated_at = now()
    where id = v_id;
  end if;
  select to_jsonb(c) into v_new from accounting_period_closures c where c.id = v_id;
  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, v_uid, case when v_old is null then 'INSERT' else 'UPDATE' end, 'accounting_period_closures', v_id, v_old, v_new);
  return v_new;
end;
$$;

create or replace function reopen_accounting_period(p_org_id uuid, p_start date, p_end date, p_note text default null)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid(); v_old jsonb; v_new jsonb; v_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Só owner ou admin podem reabrir períodos'; end if;
  select to_jsonb(c), c.id into v_old, v_id from accounting_period_closures c
  where c.organization_id = p_org_id and c.period_start = p_start and c.period_end = p_end;
  if v_id is null then raise exception 'Período não encontrado'; end if;
  update accounting_period_closures
  set status = 'reopened', reopened_by = v_uid, reopened_at = now(), note = coalesce(p_note, note), updated_at = now()
  where id = v_id;
  select to_jsonb(c) into v_new from accounting_period_closures c where c.id = v_id;
  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, v_uid, 'UPDATE', 'accounting_period_closures', v_id, v_old, v_new);
  return v_new;
end;
$$;

create or replace function list_organization_members(p_org_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  select coalesce(json_agg(row_to_json(m) order by m.role, m.name), '[]'::json) into v_result
  from (
    select om.user_id, om.role, coalesce(p.full_name, 'Utilizador') as name, p.phone
    from organization_members om left join profiles p on p.id = om.user_id
    where om.organization_id = p_org_id
  ) m;
  return v_result;
end;
$$;

create or replace function change_organization_member_role(p_org_id uuid, p_user_id uuid, p_role text)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_old text; v_new jsonb;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Só owner ou admin podem alterar permissões'; end if;
  if p_role not in ('admin', 'finance', 'viewer') then raise exception 'Papel inválido'; end if;
  select role into v_old from organization_members where organization_id = p_org_id and user_id = p_user_id;
  if v_old is null then raise exception 'Membro não encontrado'; end if;
  if v_old = 'owner' then raise exception 'O proprietário não pode ser rebaixado'; end if;
  update organization_members set role = p_role where organization_id = p_org_id and user_id = p_user_id;
  v_new := jsonb_build_object('user_id', p_user_id, 'old_role', v_old, 'new_role', p_role);
  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, v_uid, 'UPDATE', 'organization_members', p_user_id, jsonb_build_object('role', v_old), v_new);
  return v_new;
end;
$$;

create or replace function get_organization_audit(p_org_id uuid, p_limit integer default 50)
returns json
language plpgsql security invoker set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  select coalesce(json_agg(row_to_json(a) order by a.created_at desc), '[]'::json) into v_result
  from (
    select al.id, al.created_at, al.action, al.table_name, al.record_id,
      al.old_data, al.new_data, al.user_id, coalesce(p.full_name, 'Utilizador') as user_name
    from audit_logs al left join profiles p on p.id = al.user_id
    where al.organization_id = p_org_id
    order by al.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) a;
  return v_result;
end;
$$;

revoke all on function close_accounting_period(uuid, date, date, text) from public, anon;
revoke all on function reopen_accounting_period(uuid, date, date, text) from public, anon;
revoke all on function list_organization_members(uuid) from public, anon;
revoke all on function change_organization_member_role(uuid, uuid, text) from public, anon;
revoke all on function get_organization_audit(uuid, integer) from public, anon;
grant execute on function close_accounting_period(uuid, date, date, text) to authenticated;
grant execute on function reopen_accounting_period(uuid, date, date, text) to authenticated;
grant execute on function list_organization_members(uuid) to authenticated;
grant execute on function change_organization_member_role(uuid, uuid, text) to authenticated;
grant execute on function get_organization_audit(uuid, integer) to authenticated;