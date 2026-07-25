-- R1 — Cálculo de relatórios no servidor (base caixa, honesta)
-- SECURITY INVOKER: correm com os direitos do utilizador e respeitam a RLS.
-- Fonte única: journal_entries/journal_lines (numeric). Reversões: por omissão
-- excluídas (status='posted' exclui os originais revertidos; entry_type in
-- (income,expense) exclui os contra-lançamentos 'reversal') = efeito líquido.
-- p_include_reversed=true mostra bruto (original + reversão).

-- ---------- Demonstração de Resultado de Caixa ----------
create or replace function report_income_cash(p_org_id uuid, p_start date, p_end date, p_include_reversed boolean default false)
returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  with e as (
    select je.entry_type,
           coalesce(fc.name, je.metadata->>'category', 'Sem categoria') as category,
           coalesce((je.metadata->>'is_sale')::boolean, false) as is_sale,
           coalesce((je.metadata->>'tax_amount')::numeric, 0) as tax_amount,
           jl.amount
    from journal_entries je
    join journal_lines jl on jl.journal_entry_id = je.id
    left join financial_categories fc on fc.id = je.category_id
    where je.organization_id = p_org_id
      and je.transaction_date between p_start and p_end
      and coalesce(je.metadata->>'type','') not in ('capital_in','capital_out')
      and (
        (not p_include_reversed and je.status = 'posted' and je.entry_type in ('income','expense'))
        or (p_include_reversed and je.entry_type in ('income','expense'))
      )
  ), agg as (
    select
      coalesce(sum(case when entry_type='income' and is_sale then amount - tax_amount else 0 end),0) as sales_base,
      coalesce(sum(case when entry_type='income' and is_sale then tax_amount else 0 end),0) as sales_tax,
      coalesce(sum(case when entry_type='income' and not is_sale then amount else 0 end),0) as other_rev,
      coalesce(sum(case when entry_type='expense' then amount else 0 end),0) as exp
    from e
  )
  select json_build_object(
    'meta', json_build_object('basis','cash','report','income_statement','start',p_start,'end',p_end,
      'title','Demonstração de Resultado de Caixa','currency','AOA','include_reversed',p_include_reversed,
      'warnings', json_build_array('Base de caixa: reconhece receitas/gastos quando o dinheiro entra ou sai (não por competência). Relatório interno de gestão — não substitui demonstrações certificadas.')),
    'revenue', json_build_object('sales_base',agg.sales_base,'sales_tax',agg.sales_tax,'other_revenue',agg.other_rev,
      'total_revenue', agg.sales_base + agg.other_rev,
      'lines', coalesce((select json_agg(json_build_object('category',category,'amount',amt) order by amt desc)
                         from (select category, sum(case when is_sale then amount-tax_amount else amount end) amt from e where entry_type='income' group by category) r),'[]'::json)),
    'expenses', json_build_object('total', agg.exp,
      'lines', coalesce((select json_agg(json_build_object('category',category,'amount',amt) order by amt desc)
                         from (select category, sum(amount) amt from e where entry_type='expense' group by category) x),'[]'::json)),
    'net_result', agg.sales_base + agg.other_rev - agg.exp
  ) into v_result from agg;
  return v_result;
end; $$;

-- ---------- Demonstração do Fluxo de Caixa (método direto) ----------
create or replace function report_cash_flow(p_org_id uuid, p_start date, p_end date)
returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_open numeric(20,2); v_close numeric(20,2);
  v_op_receipts numeric(20,2); v_op_payments numeric(20,2);
  v_fin_in numeric(20,2); v_fin_out numeric(20,2);
  v_net numeric(20,2); v_other numeric(20,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  select coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end),0)
    into v_open from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
    where je.organization_id=p_org_id and je.transaction_date < p_start;
  select coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end),0)
    into v_close from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
    where je.organization_id=p_org_id and je.transaction_date <= p_end;

  select
    coalesce(sum(case when je.entry_type='income'  and coalesce(je.metadata->>'type','')='' then jl.amount else 0 end),0),
    coalesce(sum(case when je.entry_type='expense' and coalesce(je.metadata->>'type','')='' then jl.amount else 0 end),0),
    coalesce(sum(case when je.metadata->>'type'='capital_in'  then jl.amount else 0 end),0),
    coalesce(sum(case when je.metadata->>'type'='capital_out' then jl.amount else 0 end),0)
  into v_op_receipts, v_op_payments, v_fin_in, v_fin_out
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
  where je.organization_id=p_org_id and je.status='posted'
    and je.transaction_date between p_start and p_end
    and je.entry_type in ('income','expense');

  v_net := v_close - v_open;
  v_other := v_net - (v_op_receipts - v_op_payments) - (v_fin_in - v_fin_out);

  return json_build_object(
    'meta', json_build_object('basis','cash','report','cash_flow_statement','start',p_start,'end',p_end,
      'method','direct','title','Demonstração do Fluxo de Caixa','currency','AOA',
      'warnings', json_build_array('Método direto. Transferências internas não entram como fluxo. Sem atividades de investimento (não há ativos fixos registados). Base de caixa.')),
    'operating', json_build_object('receipts',v_op_receipts,'payments',v_op_payments,'net',v_op_receipts - v_op_payments),
    'investing', json_build_object('net',0,'note','Não aplicável — sem registo de ativos fixos'),
    'financing', json_build_object('capital_in',v_fin_in,'capital_out',v_fin_out,'net',v_fin_in - v_fin_out),
    'other', json_build_object('net',v_other,'note','Saldos iniciais e outros movimentos no período'),
    'net_change', v_net, 'opening_balance', v_open, 'closing_balance', v_close,
    'reconciles', true
  );
end; $$;

-- ---------- Controlo fiscal (mapa interno, não declaração oficial) ----------
create or replace function report_tax_control(p_org_id uuid, p_start date, p_end date)
returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_base numeric(20,2); v_tax numeric(20,2); v_regime text; v_untagged numeric(20,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  select
    coalesce(sum(case when coalesce((je.metadata->>'is_sale')::boolean,false) then jl.amount - coalesce((je.metadata->>'tax_amount')::numeric,0) else 0 end),0),
    coalesce(sum(case when coalesce((je.metadata->>'is_sale')::boolean,false) then coalesce((je.metadata->>'tax_amount')::numeric,0) else 0 end),0),
    coalesce(sum(case when not coalesce((je.metadata->>'is_sale')::boolean,false) then jl.amount else 0 end),0)
  into v_base, v_tax, v_untagged
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
  where je.organization_id=p_org_id and je.status='posted' and je.entry_type='income'
    and coalesce(je.metadata->>'type','') not in ('capital_in','capital_out')
    and je.transaction_date between p_start and p_end;

  select regime into v_regime from companies where organization_id=p_org_id;

  return json_build_object(
    'meta', json_build_object('report','tax_control','start',p_start,'end',p_end,'currency','AOA','regime',v_regime,
      'warnings', json_build_array('Mapa de controlo interno sobre vendas. Não é uma declaração fiscal oficial. Só receitas marcadas como venda geram imposto; imposto por dentro do valor.')),
    'regime', v_regime,
    'taxable_base', v_base,
    'tax_collected', v_tax,
    'non_sale_income', v_untagged,
    'estimated_payable', v_tax
  );
end; $$;

-- ---------- GRANTs ----------
revoke execute on function report_income_cash(uuid, date, date, boolean) from public, anon;
revoke execute on function report_cash_flow(uuid, date, date) from public, anon;
revoke execute on function report_tax_control(uuid, date, date) from public, anon;
grant execute on function report_income_cash(uuid, date, date, boolean) to authenticated;
grant execute on function report_cash_flow(uuid, date, date) to authenticated;
grant execute on function report_tax_control(uuid, date, date) to authenticated;
