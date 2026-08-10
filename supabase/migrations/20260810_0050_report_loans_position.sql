-- Fase 5: relatório dedicado de posição de empréstimos e adiantamentos —
-- saldo por funcionário (situação atual, não limitada ao período), vencidos,
-- e concedido/recuperado dentro do período pedido (fluxo). Formato próprio
-- (não é o genérico secções/linhas usado por DRE/DFC/impostos/aging — é
-- tabular por funcionário), no mesmo padrão de report_account_ledger.

create or replace function public.report_loans_position(p_org_id uuid, p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  return json_build_object(
    'meta', json_build_object('report', 'loans_position', 'title', 'Posição de empréstimos e adiantamentos', 'start', p_start, 'end', p_end),
    'employees', coalesce((
      select json_agg(json_build_object(
        'contact_id', c.id, 'contact_name', c.name,
        'outstanding', coalesce(emp.outstanding, 0), 'overdue', coalesce(emp.overdue, 0),
        'granted_period', coalesce(gp.granted, 0), 'recovered_period', coalesce(rp.recovered, 0),
        'loans_open', emp.loans_open, 'advances_open', emp.advances_open
      ) order by emp.outstanding desc)
      from (
        select os.contact_id,
          sum(os.outstanding_amount) filter (where os.lifecycle_status = 'open') as outstanding,
          sum(os.outstanding_amount) filter (where os.lifecycle_status = 'open' and os.days_overdue > 0) as overdue,
          count(*) filter (where os.lifecycle_status = 'open' and os.document_kind = 'employee_loan') as loans_open,
          count(*) filter (where os.lifecycle_status = 'open' and os.document_kind = 'salary_advance') as advances_open
        from obligation_status os
        where os.organization_id = p_org_id and os.document_kind in ('employee_loan', 'salary_advance')
        group by os.contact_id
      ) emp
      join contacts c on c.id = emp.contact_id
      left join (
        select o.contact_id, sum(jl.amount) as granted
        from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
        join financial_obligations o on o.disbursement_entry_id = je.id
        where je.organization_id = p_org_id and je.entry_type in ('loan_disbursement', 'salary_advance_disbursement')
          and je.transaction_date between p_start and p_end
        group by o.contact_id
      ) gp on gp.contact_id = emp.contact_id
      left join (
        select o.contact_id, sum(a.allocated_amount) as recovered
        from settlement_allocations a
        join settlements s on s.id = a.settlement_id and s.status = 'posted'
        join financial_obligations o on o.id = a.obligation_id
        where s.organization_id = p_org_id and o.document_kind in ('employee_loan', 'salary_advance')
          and s.payment_date between p_start and p_end
        group by o.contact_id
      ) rp on rp.contact_id = emp.contact_id
    ), '[]'::json),
    'totals', json_build_object(
      'outstanding', coalesce((select sum(outstanding_amount) from obligation_status where organization_id = p_org_id and document_kind in ('employee_loan', 'salary_advance') and lifecycle_status = 'open'), 0),
      'overdue', coalesce((select sum(outstanding_amount) from obligation_status where organization_id = p_org_id and document_kind in ('employee_loan', 'salary_advance') and lifecycle_status = 'open' and days_overdue > 0), 0),
      'granted_period', coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = p_org_id and je.entry_type in ('loan_disbursement', 'salary_advance_disbursement') and je.transaction_date between p_start and p_end), 0),
      'recovered_period', coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = p_org_id and je.entry_type in ('loan_repayment', 'salary_advance_repayment') and je.transaction_date between p_start and p_end), 0)
    )
  );
end; $function$;

revoke all on function public.report_loans_position(uuid, date, date) from public, anon;
grant execute on function public.report_loans_position(uuid, date, date) to authenticated;
