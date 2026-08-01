-- Fase 6c — anexos privados e notificações financeiras.

insert into storage.buckets (id, name, public)
values ('financial-attachments', 'financial-attachments', false)
on conflict (id) do update set public = false;

create table if not exists file_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  entity_type text not null check (entity_type in ('journal_entry', 'obligation', 'settlement', 'requisition', 'other')),
  entity_id uuid,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  description text,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists file_attachments_entity_idx
  on file_attachments (organization_id, entity_type, entity_id, created_at desc)
  where is_deleted = false;

alter table file_attachments enable row level security;
drop policy if exists file_attachments_select on file_attachments;
drop policy if exists file_attachments_insert on file_attachments;
drop policy if exists file_attachments_update on file_attachments;
create policy file_attachments_select on file_attachments
  for select to authenticated using (organization_id in (select user_org_ids()) and not is_deleted);
create policy file_attachments_insert on file_attachments
  for insert to authenticated with check (
    organization_id in (select user_writable_org_ids()) and uploaded_by = auth.uid()
  );
create policy file_attachments_update on file_attachments
  for update to authenticated using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));
revoke all on table file_attachments from anon, public;
grant select, insert, update on table file_attachments to authenticated;

-- O caminho começa sempre pelo organization_id. O bucket é privado e só devolve
-- objectos a membros da organização correspondente.
drop policy if exists financial_attachments_select on storage.objects;
drop policy if exists financial_attachments_insert on storage.objects;
drop policy if exists financial_attachments_update on storage.objects;
drop policy if exists financial_attachments_delete on storage.objects;
create policy financial_attachments_select on storage.objects
  for select to authenticated using (
    bucket_id = 'financial-attachments'
    and ((storage.foldername(name))[1])::uuid in (select user_org_ids())
  );
create policy financial_attachments_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'financial-attachments'
    and ((storage.foldername(name))[1])::uuid in (select user_writable_org_ids())
  );
create policy financial_attachments_update on storage.objects
  for update to authenticated using (
    bucket_id = 'financial-attachments'
    and ((storage.foldername(name))[1])::uuid in (select user_writable_org_ids())
  ) with check (
    bucket_id = 'financial-attachments'
    and ((storage.foldername(name))[1])::uuid in (select user_writable_org_ids())
  );
create policy financial_attachments_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'financial-attachments'
    and ((storage.foldername(name))[1])::uuid in (select user_writable_org_ids())
  );

create table if not exists financial_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('overdue', 'due_soon', 'reconciliation', 'system')),
  title text not null,
  body text not null,
  href text,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists financial_notifications_user_idx
  on financial_notifications (user_id, read_at, created_at desc);

alter table financial_notifications enable row level security;
drop policy if exists financial_notifications_select on financial_notifications;
drop policy if exists financial_notifications_update on financial_notifications;
create policy financial_notifications_select on financial_notifications
  for select to authenticated using (user_id = auth.uid() and organization_id in (select user_org_ids()));
create policy financial_notifications_update on financial_notifications
  for update to authenticated using (user_id = auth.uid() and organization_id in (select user_org_ids()))
  with check (user_id = auth.uid() and organization_id in (select user_org_ids()));
revoke all on table financial_notifications from anon, public;
grant select, update on table financial_notifications to authenticated;

create or replace function refresh_financial_notifications(p_org_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_inserted integer := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;

  insert into financial_notifications (organization_id, user_id, kind, title, body, href, dedupe_key, metadata)
  select o.organization_id, v_uid, 'overdue',
    'Documento vencido',
    coalesce(o.internal_number, 'Documento') || ' tem ' || to_char(o.outstanding_amount, 'FM999G999G990D00') || ' Kz em aberto.',
    case when o.direction = 'receivable' then '/faturas' else '/contas-a-pagar' end,
    'overdue:' || o.id::text || ':' || o.due_date::text,
    jsonb_build_object('obligation_id', o.id, 'direction', o.direction)
  from obligation_status o
  where o.organization_id = p_org_id and o.financial_status in ('overdue', 'partial_overdue')
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;
  v_count := v_inserted;

  insert into financial_notifications (organization_id, user_id, kind, title, body, href, dedupe_key, metadata)
  select o.organization_id, v_uid, 'due_soon',
    'Vencimento próximo',
    coalesce(o.internal_number, 'Documento') || ' vence em ' || o.due_date::text || '.',
    case when o.direction = 'receivable' then '/faturas' else '/contas-a-pagar' end,
    'due_soon:' || o.id::text || ':' || o.due_date::text,
    jsonb_build_object('obligation_id', o.id, 'direction', o.direction)
  from obligation_status o
  where o.organization_id = p_org_id
    and o.due_date between current_date and current_date + 7
    and o.financial_status not in ('cancelled', 'paid', 'overdue', 'partial_overdue')
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;
  v_count := v_count + v_inserted;

  return json_build_object('created', v_count);
end;
$$;

create or replace function mark_financial_notification_read(p_notification_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  update financial_notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = v_uid;
  if not found then raise exception 'Notificação não encontrada'; end if;
  return json_build_object('read', true, 'id', p_notification_id);
end;
$$;

create or replace function mark_all_financial_notifications_read(p_org_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_count integer;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  update financial_notifications set read_at = coalesce(read_at, now())
  where organization_id = p_org_id and user_id = v_uid and read_at is null;
  get diagnostics v_count = row_count;
  return json_build_object('read', v_count);
end;
$$;

revoke all on function refresh_financial_notifications(uuid) from public, anon;
revoke all on function mark_financial_notification_read(uuid) from public, anon;
revoke all on function mark_all_financial_notifications_read(uuid) from public, anon;
grant execute on function refresh_financial_notifications(uuid) to authenticated;
grant execute on function mark_financial_notification_read(uuid) to authenticated;
grant execute on function mark_all_financial_notifications_read(uuid) to authenticated;