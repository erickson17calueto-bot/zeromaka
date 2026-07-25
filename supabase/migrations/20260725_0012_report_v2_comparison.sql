-- Relatórios v2 — forma uniforme (secções + totais) com comparação entre períodos
-- Cada função devolve { meta, sections:[{title, lines:[{label,current,comparison,difference}],
-- subtotal}], totals:[{label,current,comparison,difference,emphasis}] }. Base caixa.
-- Comparação opcional (p_cmp_start/p_cmp_end). Tudo em numeric no servidor.

-- ---------- Demonstração de Resultado de Caixa ----------
drop function if exists report_income_cash(uuid, date, date, boolean);
create or replace function report_income_cash(
  p_org_id uuid, p_start date, p_end date,
  p_cmp_start date default null, p_cmp_end date default null,
  p_include_reversed boolean default false
) returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cmp boolean := p_cmp_start is not null and p_cmp_end is not null;
  v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;
  if v_cmp and p_cmp_start > p_cmp_end then raise exception 'Datas de comparação invertidas'; end if;

  with base as (
    select je.entry_type,
      coalesce(fc.name, je.metadata->>'category', 'Sem categoria') as category,
      coalesce((je.metadata->>'is_sale')::boolean, false) as is_sale,
      coalesce((je.metadata->>'tax_amount')::numeric, 0) as tax_amount,
      jl.amount, je.transaction_date
    from journal_entries je
    join journal_lines jl on jl.journal_entry_id = je.id
    left join financial_categories fc on fc.id = je.category_id
    where je.organization_id = p_org_id
      and coalesce(je.metadata->>'type','') not in ('capital_in','capital_out')
      and ( (not p_include_reversed and je.status = 'posted' and je.entry_type in ('income','expense'))
            or (p_include_reversed and je.entry_type in ('income','expense')) )
      and ( (je.transaction_date between p_start and p_end)
            or (v_cmp and je.transaction_date between p_cmp_start and p_cmp_end) )
  ),
  t as (
    select entry_type, category,
      case when transaction_date between p_start and p_end then 'cur'
           when v_cmp and transaction_date between p_cmp_start and p_cmp_end then 'cmp' end as bucket,
      case when entry_type='income' then (case when is_sale then amount - tax_amount else amount end) else 0 end as rev_net,
      case when entry_type='expense' then amount else 0 end as exp_amt
    from base
  )
  select json_build_object(
    'meta', json_build_object('report','income_statement','basis','cash','currency','AOA',
      'title','Demonstração de Resultado de Caixa','start',p_start,'end',p_end,
      'cmp_start',p_cmp_start,'cmp_end',p_cmp_end,'has_comparison',v_cmp,'include_reversed',p_include_reversed,
      'warnings', json_build_array('Base de caixa: reconhece receitas/gastos quando o dinheiro entra ou sai (não por competência). Relatório interno de gestão — não substitui demonstrações certificadas.')),
    'sections', json_build_array(
      json_build_object('title','Receitas',
        'lines', coalesce((select json_agg(json_build_object('label',category,'current',cur,'comparison',case when v_cmp then cmp else null end,'difference',case when v_cmp then cur-cmp else null end) order by cur desc)
          from (select category, coalesce(sum(rev_net) filter (where bucket='cur'),0) cur, coalesce(sum(rev_net) filter (where bucket='cmp'),0) cmp from t where entry_type='income' group by category having coalesce(sum(rev_net) filter (where bucket='cur'),0)<>0 or coalesce(sum(rev_net) filter (where bucket='cmp'),0)<>0) r),'[]'::json),
        'subtotal', json_build_object('label','Receita total',
          'current',(select coalesce(sum(rev_net) filter (where bucket='cur'),0) from t),
          'comparison',case when v_cmp then (select coalesce(sum(rev_net) filter (where bucket='cmp'),0) from t) else null end,
          'difference',case when v_cmp then (select coalesce(sum(rev_net) filter (where bucket='cur'),0)-coalesce(sum(rev_net) filter (where bucket='cmp'),0) from t) else null end)),
      json_build_object('title','Despesas',
        'lines', coalesce((select json_agg(json_build_object('label',category,'current',-cur,'comparison',case when v_cmp then -cmp else null end,'difference',case when v_cmp then -(cur-cmp) else null end) order by cur desc)
          from (select category, coalesce(sum(exp_amt) filter (where bucket='cur'),0) cur, coalesce(sum(exp_amt) filter (where bucket='cmp'),0) cmp from t where entry_type='expense' group by category having coalesce(sum(exp_amt) filter (where bucket='cur'),0)<>0 or coalesce(sum(exp_amt) filter (where bucket='cmp'),0)<>0) x),'[]'::json),
        'subtotal', json_build_object('label','Total de despesas',
          'current',(select -coalesce(sum(exp_amt) filter (where bucket='cur'),0) from t),
          'comparison',case when v_cmp then (select -coalesce(sum(exp_amt) filter (where bucket='cmp'),0) from t) else null end,
          'difference',case when v_cmp then (select -(coalesce(sum(exp_amt) filter (where bucket='cur'),0)-coalesce(sum(exp_amt) filter (where bucket='cmp'),0)) from t) else null end))
    ),
    'totals', json_build_array(
      json_build_object('label','Resultado do período','emphasis',true,
        'current',(select coalesce(sum(rev_net) filter (where bucket='cur'),0)-coalesce(sum(exp_amt) filter (where bucket='cur'),0) from t),
        'comparison',case when v_cmp then (select coalesce(sum(rev_net) filter (where bucket='cmp'),0)-coalesce(sum(exp_amt) filter (where bucket='cmp'),0) from t) else null end,
        'difference',case when v_cmp then (select (coalesce(sum(rev_net) filter (where bucket='cur'),0)-coalesce(sum(exp_amt) filter (where bucket='cur'),0))-(coalesce(sum(rev_net) filter (where bucket='cmp'),0)-coalesce(sum(exp_amt) filter (where bucket='cmp'),0)) from t) else null end)
    )
  ) into v_result;
  return v_result;
end; $$;

revoke execute on function report_income_cash(uuid, date, date, date, date, boolean) from public, anon;
grant execute on function report_income_cash(uuid, date, date, date, date, boolean) to authenticated;
