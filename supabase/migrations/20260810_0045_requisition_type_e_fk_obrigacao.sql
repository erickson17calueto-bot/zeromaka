-- Fase 1 (requisições): tipo de requisição, campos de empréstimo/
-- adiantamento, e ligação real (FK) requisição → obrigação, para deixar
-- de depender só de metadata JSON para essa relação. Também impede duas
-- obrigações ligadas à mesma requisição ou ao mesmo lançamento de
-- desembolso.

create type requisition_type as enum (
  'expense', 'purchase', 'employee_loan', 'salary_advance', 'operational_advance', 'other'
);

alter table requisitions
  add column type requisition_type not null default 'expense',
  add column beneficiary_contact_id uuid references contacts(id),
  add column due_date date,
  add column installments int check (installments is null or installments > 0),
  add column recovery_method text check (recovery_method is null or recovery_method in ('direct_payment', 'salary_deduction', 'mixed'));

-- Beneficiário só faz sentido (e só é exigido) para empréstimo/adiantamento
-- — validado nas RPCs, não aqui, para não travar requisições normais que
-- nunca preenchem este campo.
comment on column requisitions.beneficiary_contact_id is
  'Só relevante quando type = employee_loan/salary_advance/operational_advance. Validado em disburse_requisition, não por constraint, para não afetar requisições normais.';

alter table financial_obligations
  add column source_requisition_id uuid references requisitions(id);

create unique index if not exists idx_obligations_unique_source_requisition
  on financial_obligations (source_requisition_id) where source_requisition_id is not null;

create unique index if not exists idx_obligations_unique_disbursement_entry
  on financial_obligations (disbursement_entry_id) where disbursement_entry_id is not null;

create index if not exists idx_requisitions_beneficiary on requisitions (beneficiary_contact_id) where beneficiary_contact_id is not null;
