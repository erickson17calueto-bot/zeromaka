-- Fase 4a — Reservas financeiras, movimentos e configurações
-- Reservas classificam parte do saldo como comprometida. NÃO movem dinheiro,
-- NÃO criam journal_entries, NÃO alteram o saldo bancário.
-- Valores em numeric(20,2). RLS ligado desde já; escrita só via RPCs (4b).

create type reserve_category_type as enum (
  'payroll', 'tax', 'emergency', 'rent', 'supplier', 'maintenance', 'investment', 'custom'
);
create type reserve_type as enum ('general', 'account_specific', 'obligation_linked');
create type reserve_status as enum ('active', 'partially_released', 'released', 'cancelled');
create type reserve_priority as enum ('critical', 'high', 'normal', 'low');
create type reserve_movement_type as enum (
  'create', 'increase', 'decrease', 'release', 'cancel', 'consume_on_payment'
);

-- ---------- reserve_categories ----------
create table reserve_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  category_type reserve_category_type not null default 'custom',
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_rescat_org on reserve_categories(organization_id);

-- ---------- financial_reserves ----------
create table financial_reserves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category_id uuid not null references reserve_categories(id),
  name text not null,
  description text,
  reserve_type reserve_type not null default 'general',
  account_id uuid references accounts(id),
  obligation_id uuid references financial_obligations(id),
  target_amount numeric(20,2) check (target_amount is null or target_amount > 0),
  reserved_amount numeric(20,2) not null check (reserved_amount >= 0),
  start_date date not null default current_date,
  target_date date,
  status reserve_status not null default 'active',
  priority reserve_priority not null default 'normal',
  source text not null default 'manual',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references auth.users(id),
  release_reason text,
  -- coerência: tipo por conta exige conta; tipo ligado exige obrigação
  check (reserve_type <> 'account_specific' or account_id is not null),
  check (reserve_type <> 'obligation_linked' or obligation_id is not null)
);
create index idx_reserves_org on financial_reserves(organization_id);
create index idx_reserves_category on financial_reserves(category_id);
create index idx_reserves_account on financial_reserves(account_id);
create index idx_reserves_obligation on financial_reserves(obligation_id);
create index idx_reserves_status on financial_reserves(organization_id, status);
create index idx_reserves_priority on financial_reserves(organization_id, priority);
create index idx_reserves_target_date on financial_reserves(organization_id, target_date);

-- ---------- reserve_movements (histórico imutável) ----------
create table reserve_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  reserve_id uuid not null references financial_reserves(id) on delete cascade,
  movement_type reserve_movement_type not null,
  amount numeric(20,2) not null check (amount > 0),
  reason text,
  settlement_id uuid references settlements(id),
  performed_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_resmov_org on reserve_movements(organization_id);
create index idx_resmov_reserve on reserve_movements(reserve_id);
create index idx_resmov_settlement on reserve_movements(settlement_id);

-- ---------- organization_financial_settings ----------
create table organization_financial_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  default_commitment_horizon_days int not null default 7
    check (default_commitment_horizon_days in (7, 15, 30)),
  include_overdue_payables boolean not null default true,
  include_approved_requisitions boolean not null default true,
  include_archived_accounts boolean not null default false,
  minimum_cash_buffer numeric(20,2) not null default 0 check (minimum_cash_buffer >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ---------- triggers (updated_at + auditoria) ----------
create trigger trg_rescat_updated before update on reserve_categories
  for each row execute function set_updated_at();
create trigger trg_reserves_updated before update on financial_reserves
  for each row execute function set_updated_at();

create trigger trg_rescat_audit after insert or update or delete on reserve_categories
  for each row execute function audit_financial_change();
create trigger trg_reserves_audit after insert or update or delete on financial_reserves
  for each row execute function audit_financial_change();
create trigger trg_resmov_audit after insert or update or delete on reserve_movements
  for each row execute function audit_financial_change();
create trigger trg_finsettings_audit after insert or update or delete on organization_financial_settings
  for each row execute function audit_financial_change();

-- ---------- seed de categorias por organização ----------
create or replace function seed_reserve_categories(p_org_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  insert into reserve_categories (organization_id, name, category_type, is_system)
  values
    (p_org_id, 'Salários', 'payroll', true),
    (p_org_id, 'Impostos', 'tax', true),
    (p_org_id, 'Renda', 'rent', true),
    (p_org_id, 'Fornecedores', 'supplier', true),
    (p_org_id, 'Emergência', 'emergency', true),
    (p_org_id, 'Manutenção', 'maintenance', true),
    (p_org_id, 'Investimento', 'investment', true)
  on conflict (organization_id, name) do nothing;
end; $$;

-- ---------- RLS + GRANTs mínimos ----------
alter table reserve_categories enable row level security;
alter table financial_reserves enable row level security;
alter table reserve_movements enable row level security;
alter table organization_financial_settings enable row level security;

create policy sel_rescat on reserve_categories
  for select using (organization_id in (select user_org_ids()));
create policy sel_reserves on financial_reserves
  for select using (organization_id in (select user_org_ids()));
create policy sel_resmov on reserve_movements
  for select using (organization_id in (select user_org_ids()));
create policy sel_finsettings on organization_financial_settings
  for select using (organization_id in (select user_org_ids()));

-- privilégios default do Postgres dão tudo a anon/authenticated — revogar e reconceder mínimo
revoke all on reserve_categories from anon, authenticated, public;
revoke all on financial_reserves from anon, authenticated, public;
revoke all on reserve_movements from anon, authenticated, public;
revoke all on organization_financial_settings from anon, authenticated, public;

grant select on reserve_categories to authenticated;
grant select on financial_reserves to authenticated;
grant select on reserve_movements to authenticated;
grant select on organization_financial_settings to authenticated;

revoke execute on function seed_reserve_categories(uuid) from public, anon;
grant execute on function seed_reserve_categories(uuid) to authenticated;
