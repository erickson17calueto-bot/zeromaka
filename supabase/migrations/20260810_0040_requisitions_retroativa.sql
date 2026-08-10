-- Migração retroativa: a tabela `requisitions` e o enum `req_status` já
-- existiam ao vivo na base de dados, mas nunca tinham sido versionados em
-- supabase/migrations/ — o repositório não conseguia reconstruir esta parte
-- do banco do zero. Esta migração espelha exatamente o schema já vivo
-- (colunas, índices, constraints, triggers, RLS).
--
-- Idempotente de propósito: neste projeto os objetos já existem (aplicar
-- só regista a versão sem recriar nada); num projeto novo, cria tudo do
-- zero normalmente. Base para as migrações seguintes desta fase (tipos de
-- requisição, separar aprovar de desembolsar).

do $$ begin
  create type req_status as enum ('pendente', 'aprovado', 'reprovado');
exception when duplicate_object then null;
end $$;

create table if not exists requisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  number text not null,
  requester text not null,
  approver text not null,
  department text,
  items jsonb not null default '[]'::jsonb,
  amount bigint not null check (amount > 0),
  date date not null default current_date,
  purpose text not null,
  category text not null,
  status req_status not null default 'pendente',
  account_id uuid references accounts(id) on delete set null,
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_requisitions_org on requisitions (organization_id);
create index if not exists idx_requisitions_status on requisitions (organization_id, status);

alter table requisitions enable row level security;

drop policy if exists "Members can view requisitions" on requisitions;
create policy "Members can view requisitions" on requisitions for select
  using (organization_id in (select user_org_ids()));

drop policy if exists "Writers can insert requisitions" on requisitions;
create policy "Writers can insert requisitions" on requisitions for insert
  with check (organization_id in (select user_writable_org_ids()));

drop policy if exists "Writers can update requisitions" on requisitions;
create policy "Writers can update requisitions" on requisitions for update
  using (organization_id in (select user_writable_org_ids()));

drop policy if exists "Writers can delete requisitions" on requisitions;
create policy "Writers can delete requisitions" on requisitions for delete
  using (organization_id in (select user_writable_org_ids()));

drop trigger if exists trg_requisitions_updated_at on requisitions;
create trigger trg_requisitions_updated_at before update on requisitions
  for each row execute function set_updated_at();

drop trigger if exists trg_audit_requisitions on requisitions;
create trigger trg_audit_requisitions after insert or delete or update on requisitions
  for each row execute function audit_financial_change();

revoke all on requisitions from public, anon;
grant select, insert, update, delete on requisitions to authenticated;
