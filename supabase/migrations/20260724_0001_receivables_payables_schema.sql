-- Fase 3a — Contas a receber/pagar: esquema
-- Modelo unificado de obrigações financeiras + liquidações + alocações + cobranças.
-- Valores monetários em numeric(20,2), consistentes com o livro (journal_lines).

-- ---------- Enums ----------
alter type contact_kind add value if not exists 'ambos';

create type obligation_direction as enum ('receivable', 'payable');
create type obligation_document_kind as enum (
  'invoice_reference', 'service_charge', 'product_sale',
  'supplier_invoice', 'expense_commitment', 'other'
);
create type obligation_lifecycle as enum ('open', 'cancelled');
create type settlement_direction as enum ('incoming', 'outgoing');
create type settlement_status as enum ('posted', 'reversed');
create type collection_channel as enum ('whatsapp', 'phone', 'email', 'in_person', 'other');
create type collection_interaction_type as enum (
  'reminder', 'collection', 'negotiation', 'promise_to_pay', 'dispute', 'note'
);
create type collection_outcome as enum (
  'contacted', 'no_response', 'promised_payment', 'disputed',
  'paid', 'follow_up_required', 'other'
);

-- ---------- Contacts: campos adicionais ----------
alter table contacts add column if not exists whatsapp text;
alter table contacts add column if not exists credit_limit numeric(20,2);
alter table contacts add column if not exists is_archived boolean not null default false;

-- ---------- Numeração interna de documentos (REC-/PAG-/LIQ-) ----------
create table document_number_sequences (
  organization_id uuid not null references organizations(id) on delete cascade,
  prefix text not null,
  year int not null,
  last_number int not null default 0,
  primary key (organization_id, prefix, year)
);

create or replace function next_document_number(p_org_id uuid, p_prefix text, p_year int)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare v_num int;
begin
  insert into public.document_number_sequences (organization_id, prefix, year, last_number)
  values (p_org_id, p_prefix, p_year, 1)
  on conflict (organization_id, prefix, year)
  do update set last_number = public.document_number_sequences.last_number + 1
  returning last_number into v_num;
  return p_prefix || '-' || p_year || '-' || lpad(v_num::text, 6, '0');
end; $$;

-- ---------- financial_obligations ----------
create table financial_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  direction obligation_direction not null,
  internal_number text not null,
  contact_id uuid not null references contacts(id),
  document_kind obligation_document_kind not null default 'other',
  external_document_number text,
  issue_date date not null default current_date,
  due_date date not null,
  original_amount numeric(20,2) not null check (original_amount > 0),
  currency_code text not null default 'AOA',
  description text,
  notes text,
  lifecycle_status obligation_lifecycle not null default 'open',
  category_id uuid references financial_categories(id),
  source text not null default 'manual',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  unique (organization_id, internal_number),
  check (due_date >= issue_date)
);

create index idx_obligations_org on financial_obligations(organization_id);
create index idx_obligations_contact on financial_obligations(contact_id);
create index idx_obligations_category on financial_obligations(category_id);
create index idx_obligations_direction on financial_obligations(organization_id, direction);
create index idx_obligations_due on financial_obligations(organization_id, due_date);
create index idx_obligations_issue on financial_obligations(organization_id, issue_date);
create index idx_obligations_lifecycle on financial_obligations(organization_id, lifecycle_status);

-- ---------- settlements ----------
create table settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  internal_number text not null,
  direction settlement_direction not null,
  contact_id uuid not null references contacts(id),
  account_id uuid not null references accounts(id),
  payment_date date not null default current_date,
  total_amount numeric(20,2) not null check (total_amount > 0),
  currency_code text not null default 'AOA',
  payment_method text,
  reference text,
  notes text,
  status settlement_status not null default 'posted',
  idempotency_key uuid not null default gen_random_uuid(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  unique (organization_id, internal_number),
  unique (organization_id, idempotency_key)
);

create index idx_settlements_org on settlements(organization_id);
create index idx_settlements_contact on settlements(contact_id);
create index idx_settlements_account on settlements(account_id);
create index idx_settlements_direction on settlements(organization_id, direction);
create index idx_settlements_date on settlements(organization_id, payment_date);

-- ---------- settlement_allocations ----------
create table settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  settlement_id uuid not null references settlements(id) on delete cascade,
  obligation_id uuid not null references financial_obligations(id),
  allocated_amount numeric(20,2) not null check (allocated_amount > 0),
  journal_entry_id uuid references journal_entries(id),
  created_at timestamptz not null default now()
);

create index idx_alloc_org on settlement_allocations(organization_id);
create index idx_alloc_settlement on settlement_allocations(settlement_id);
create index idx_alloc_obligation on settlement_allocations(obligation_id);
create index idx_alloc_journal on settlement_allocations(journal_entry_id);

-- ---------- collection_interactions ----------
create table collection_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  obligation_id uuid references financial_obligations(id),
  contact_id uuid not null references contacts(id),
  channel collection_channel not null,
  interaction_type collection_interaction_type not null,
  message text,
  outcome collection_outcome,
  promised_payment_date date,
  next_follow_up_at timestamptz,
  performed_at timestamptz not null default now(),
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_interactions_org on collection_interactions(organization_id);
create index idx_interactions_obligation on collection_interactions(obligation_id);
create index idx_interactions_contact on collection_interactions(contact_id);
create index idx_interactions_followup on collection_interactions(organization_id, next_follow_up_at);

-- ---------- updated_at + audit triggers ----------
create trigger trg_obligations_updated before update on financial_obligations
  for each row execute function set_updated_at();

create trigger trg_obligations_audit after insert or update or delete on financial_obligations
  for each row execute function audit_financial_change();
create trigger trg_settlements_audit after insert or update or delete on settlements
  for each row execute function audit_financial_change();
create trigger trg_allocations_audit after insert or update or delete on settlement_allocations
  for each row execute function audit_financial_change();
create trigger trg_interactions_audit after insert or update or delete on collection_interactions
  for each row execute function audit_financial_change();

-- ---------- RLS ligado imediatamente (deny-all até às políticas da 3c) ----------
alter table financial_obligations enable row level security;
alter table settlements enable row level security;
alter table settlement_allocations enable row level security;
alter table collection_interactions enable row level security;
alter table document_number_sequences enable row level security;
