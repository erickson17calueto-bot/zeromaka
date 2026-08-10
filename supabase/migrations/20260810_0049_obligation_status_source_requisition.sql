-- Expõe source_requisition_id na view obligation_status (a coluna já
-- existe em financial_obligations desde a Fase 1). Regra do projeto: numa
-- CREATE OR REPLACE VIEW, colunas novas têm de ir sempre no fim da lista —
-- não dá para inserir no meio, mesmo que faça mais sentido logicamente ali.

create or replace view obligation_status as
select
  o.id, o.organization_id, o.direction, o.contact_id, o.internal_number, o.document_kind,
  o.external_document_number, o.issue_date, o.due_date, o.original_amount, o.currency_code,
  o.description, o.notes, o.lifecycle_status, o.category_id, o.created_at, o.created_by,
  o.is_sale, o.tax_amount,
  coalesce(p.paid, 0::numeric)::numeric(20,2) as paid_amount,
  (o.original_amount - coalesce(p.paid, 0::numeric))::numeric(20,2) as outstanding_amount,
  case
    when o.lifecycle_status = 'open'::obligation_lifecycle and (o.original_amount - coalesce(p.paid, 0::numeric)) > 0::numeric and o.due_date < current_date then current_date - o.due_date
    else 0
  end as days_overdue,
  case
    when o.lifecycle_status = 'cancelled'::obligation_lifecycle then 'cancelled'::text
    when (o.original_amount - coalesce(p.paid, 0::numeric)) <= 0::numeric then 'paid'::text
    else case
      when o.due_date < current_date and coalesce(p.paid, 0::numeric) > 0::numeric then 'partial_overdue'::text
      when o.due_date < current_date then 'overdue'::text
      when o.due_date = current_date then 'due_today'::text
      when coalesce(p.paid, 0::numeric) > 0::numeric then 'partial'::text
      else 'open'::text
    end
  end as financial_status,
  o.disbursement_entry_id,
  o.source_requisition_id
from financial_obligations o
left join (
  select a.obligation_id, sum(a.allocated_amount) as paid
  from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted'::settlement_status
  group by a.obligation_id
) p on p.obligation_id = o.id;
