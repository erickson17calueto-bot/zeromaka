-- Fase 6e — ativos fixos e centros de custo.
-- A depreciação guardada aqui é uma estimativa patrimonial; só entra no diário
-- quando existir uma política/conta contabilística específica para o efeito.

create table if not exists cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  code text not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table cash_budgets add column if not exists cost_center_id uuid references cost_centers(id);
create index if not exists cost_centers_org_idx on cost_centers (organization_id, active, name);

create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  cost_center_id uuid references cost_centers(id),
  code text not null,
  name text not null check (length(trim(name)) > 0),
  asset_category text not null default 'outros',
  acquisition_date date not null,
  purchase_cost numeric(20,2) not null check (purchase_cost > 0),
  salvage_value numeric(20,2) not null default 0 check (salvage_value >= 0),
  useful_life_months integer not null check (useful_life_months > 0),
  status text not null default 'active' check (status in ('active', 'disposed', 'fully_depreciated')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (salvage_value <= purchase_cost)
);

create index if not exists fixed_assets_org_idx on fixed_assets (organization_id, status, acquisition_date desc);
create index if not exists fixed_assets_cost_center_idx on fixed_assets (organization_id, cost_center_id);

create table if not exists fixed_asset_depreciation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  asset_id uuid not null references fixed_assets(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(20,2) not null check (amount >= 0),
  journal_entry_id uuid references journal_entries(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (asset_id, period_start, period_end),
  check (period_start <= period_end)
);

alter table cost_centers enable row level security;
alter table fixed_assets enable row level security;
alter table fixed_asset_depreciation_events enable row level security;

drop policy if exists cost_centers_select on cost_centers;
drop policy if exists cost_centers_insert on cost_centers;
drop policy if exists cost_centers_update on cost_centers;
create policy cost_centers_select on cost_centers for select to authenticated using (organization_id in (select user_org_ids()));
create policy cost_centers_insert on cost_centers for insert to authenticated with check (organization_id in (select user_writable_org_ids()) and created_by = auth.uid());
create policy cost_centers_update on cost_centers for update to authenticated using (organization_id in (select user_writable_org_ids())) with check (organization_id in (select user_writable_org_ids()));

drop policy if exists fixed_assets_select on fixed_assets;
drop policy if exists fixed_assets_insert on fixed_assets;
drop policy if exists fixed_assets_update on fixed_assets;
create policy fixed_assets_select on fixed_assets for select to authenticated using (organization_id in (select user_org_ids()));
create policy fixed_assets_insert on fixed_assets for insert to authenticated with check (organization_id in (select user_writable_org_ids()) and created_by = auth.uid());
create policy fixed_assets_update on fixed_assets for update to authenticated using (organization_id in (select user_writable_org_ids())) with check (organization_id in (select user_writable_org_ids()));

drop policy if exists fixed_asset_events_select on fixed_asset_depreciation_events;
drop policy if exists fixed_asset_events_insert on fixed_asset_depreciation_events;
create policy fixed_asset_events_select on fixed_asset_depreciation_events for select to authenticated using (organization_id in (select user_org_ids()));
create policy fixed_asset_events_insert on fixed_asset_depreciation_events for insert to authenticated with check (organization_id in (select user_writable_org_ids()) and created_by = auth.uid());

revoke all on table cost_centers, fixed_assets, fixed_asset_depreciation_events from anon, public;
grant select, insert, update on table cost_centers to authenticated;
grant select, insert, update on table fixed_assets to authenticated;
grant select, insert on table fixed_asset_depreciation_events to authenticated;