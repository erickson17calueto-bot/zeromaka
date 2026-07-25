-- R2 (parcial) — Auditoria de exportações de relatórios
create table report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  report_type text not null,
  format text not null check (format in ('pdf','xlsx','csv')),
  filters_json jsonb not null default '{}',
  comparison_json jsonb,
  status text not null default 'completed' check (status in ('completed','error')),
  generated_by uuid references auth.users(id) default auth.uid(),
  generated_at timestamptz not null default now(),
  row_count int,
  file_size int,
  file_hash text,
  version int not null default 1,
  error_code text,
  error_message_safe text
);
create index idx_report_exports_org on report_exports(organization_id, generated_at desc);

alter table report_exports enable row level security;

-- SELECT: membros da org
create policy sel_report_exports on report_exports
  for select using (organization_id in (select user_org_ids()));
-- INSERT: membros da org, sempre em nome do próprio utilizador
create policy ins_report_exports on report_exports
  for insert with check (organization_id in (select user_org_ids()) and generated_by = auth.uid());

revoke all on report_exports from anon, authenticated, public;
grant select, insert on report_exports to authenticated;
