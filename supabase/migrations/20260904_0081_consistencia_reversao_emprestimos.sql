-- Mantém a obrigação de empréstimo/adiantamento coerente com a reversão
-- do desembolso que a criou. A reversão continua a ser auditável: o
-- lançamento original fica 'reversed' e o contra-lançamento é preservado.
create or replace function public.reverse_journal_entry(
  p_entry_id uuid,
  p_reason text default ''::text
)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_entry record;
  v_loan_obligation record;
  v_paid numeric(20,2) := 0;
  v_rid uuid := gen_random_uuid();
  v_num text;
  v_line record;
  v_opp line_direction;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  -- Lock both sides before checking status so two reversões concorrentes não
  -- possam criar duas obrigações canceladas/contra-lançamentos.
  select * into v_entry
    from journal_entries
   where id = p_entry_id
   for update;
  if v_entry.id is null then raise exception 'Movimento não encontrado'; end if;
  if v_entry.organization_id not in (select user_admin_org_ids()) then
    raise exception 'Apenas owner ou admin podem reverter movimentos';
  end if;
  if v_entry.status = 'reversed' then raise exception 'Este movimento já foi revertido'; end if;
  if v_entry.entry_type = 'reversal' then raise exception 'Não é possível reverter uma reversão'; end if;

  -- Um desembolso já devolvido não pode ser revertido, pois isso deixaria a
  -- obrigação parcialmente paga sem o movimento de caixa correspondente.
  if v_entry.entry_type in ('loan_disbursement', 'salary_advance_disbursement') then
    select o.* into v_loan_obligation
      from financial_obligations o
     where o.disbursement_entry_id = p_entry_id
       and o.document_kind in ('employee_loan', 'salary_advance')
     for update;

    if v_loan_obligation.id is not null then
      select coalesce(sum(a.allocated_amount), 0) into v_paid
        from settlement_allocations a
        join settlements s on s.id = a.settlement_id and s.status = 'posted'
       where a.obligation_id = v_loan_obligation.id;
      if v_paid > 0 then
        raise exception 'Não é possível reverter %: já existem devoluções confirmadas no valor de %',
          v_loan_obligation.internal_number, v_paid;
      end if;
    end if;
  end if;

  v_num := next_entry_number(v_entry.organization_id, extract(year from current_date)::int);
  insert into journal_entries (
    id, organization_id, entry_number, entry_type, transaction_date,
    description, reference, category_id, contact_id, source,
    idempotency_key, created_by, reverses_entry_id, reversal_reason, metadata
  ) values (
    v_rid, v_entry.organization_id, v_num, 'reversal', current_date,
    'Reversão: ' || v_entry.description, v_entry.entry_number,
    v_entry.category_id, v_entry.contact_id, 'reversal', gen_random_uuid(),
    v_uid, p_entry_id, p_reason, v_entry.metadata
  );

  for v_line in select * from journal_lines where journal_entry_id = p_entry_id loop
    v_opp := case when v_line.direction = 'debit' then 'credit'::line_direction else 'debit'::line_direction end;
    insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount)
    values (v_entry.organization_id, v_rid, v_line.account_id, v_opp, v_line.amount);
  end loop;

  update journal_entries
     set status = 'reversed', reversed_at = now(), reversed_by_entry_id = v_rid
   where id = p_entry_id;

  if v_loan_obligation.id is not null then
    update financial_obligations
       set lifecycle_status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = v_uid,
           cancellation_reason = 'Desembolso revertido' ||
             case when nullif(btrim(p_reason), '') is null then '' else ': ' || btrim(p_reason) end
     where id = v_loan_obligation.id;
  end if;

  return json_build_object('id', v_rid, 'entry_number', v_num, 'original_id', p_entry_id);
end; $function$;

-- O relatório de posição deve excluir desembolsos/devoluções revertidos. A
-- reversão já contém linhas opostas para o saldo de caixa; contar o original
-- por estado produziria um total concedido/recolhido falso.
create or replace function public.report_loans_position(p_org_id uuid, p_start date, p_end date)
 returns json
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if not user_can_view(p_org_id, 'loans') then raise exception 'Sem permissão nesta organização'; end if;
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
        where je.organization_id = p_org_id and je.status = 'posted'
          and je.entry_type in ('loan_disbursement', 'salary_advance_disbursement')
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
      'granted_period', coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = p_org_id and je.status = 'posted' and je.entry_type in ('loan_disbursement', 'salary_advance_disbursement') and je.transaction_date between p_start and p_end), 0),
      'recovered_period', coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = p_org_id and je.status = 'posted' and je.entry_type in ('loan_repayment', 'salary_advance_repayment') and je.transaction_date between p_start and p_end), 0)
    )
  );
end; $function$;
