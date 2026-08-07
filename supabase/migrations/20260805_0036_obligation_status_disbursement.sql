-- obligation_status lista as colunas explicitamente (não usa o.*), por isso
-- disbursement_entry_id (20260805_0035) fica invisível ao frontend sem isto.
create or replace view public.obligation_status as
 SELECT o.id,
    o.organization_id,
    o.direction,
    o.contact_id,
    o.internal_number,
    o.document_kind,
    o.external_document_number,
    o.issue_date,
    o.due_date,
    o.original_amount,
    o.currency_code,
    o.description,
    o.notes,
    o.lifecycle_status,
    o.category_id,
    o.created_at,
    o.created_by,
    o.is_sale,
    o.tax_amount,
    COALESCE(p.paid, 0::numeric)::numeric(20,2) AS paid_amount,
    (o.original_amount - COALESCE(p.paid, 0::numeric))::numeric(20,2) AS outstanding_amount,
        CASE
            WHEN o.lifecycle_status = 'open'::obligation_lifecycle AND (o.original_amount - COALESCE(p.paid, 0::numeric)) > 0::numeric AND o.due_date < CURRENT_DATE THEN CURRENT_DATE - o.due_date
            ELSE 0
        END AS days_overdue,
        CASE
            WHEN o.lifecycle_status = 'cancelled'::obligation_lifecycle THEN 'cancelled'::text
            WHEN (o.original_amount - COALESCE(p.paid, 0::numeric)) <= 0::numeric THEN 'paid'::text
            ELSE
            CASE
                WHEN o.due_date < CURRENT_DATE AND COALESCE(p.paid, 0::numeric) > 0::numeric THEN 'partial_overdue'::text
                WHEN o.due_date < CURRENT_DATE THEN 'overdue'::text
                WHEN o.due_date = CURRENT_DATE THEN 'due_today'::text
                WHEN COALESCE(p.paid, 0::numeric) > 0::numeric THEN 'partial'::text
                ELSE 'open'::text
            END
        END AS financial_status,
    o.disbursement_entry_id
   FROM financial_obligations o
     LEFT JOIN ( SELECT a.obligation_id,
            sum(a.allocated_amount) AS paid
           FROM settlement_allocations a
             JOIN settlements s ON s.id = a.settlement_id AND s.status = 'posted'::settlement_status
          GROUP BY a.obligation_id) p ON p.obligation_id = o.id;
