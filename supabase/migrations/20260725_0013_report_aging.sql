-- Mapa de Antiguidade de Saldos (aging) — mesma forma uniforme dos relatórios v2
-- { meta, sections:[{title, lines, subtotal}], totals }, consumida por ecrã, PDF e Excel.
--
-- Fotografia à data de referência (p_end). Os escalões aparecem SEMPRE, zerados
-- quando não há documentos (convenção de demonstração formal).
-- Sem comparação: é um saldo pontual, não reconstruído historicamente — ver
-- meta.warnings. Cálculo todo em numeric no servidor.
create or replace function report_aging(
  p_org_id uuid, p_start date, p_end date,
  p_cmp_start date default null, p_cmp_end date default null
) returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  with buckets(ord, label, lo, hi) as (
    values (1,'Corrente (ainda por vencer)', -100000, 0),
           (2,'Vencido 1 a 30 dias',   1,  30),
           (3,'Vencido 31 a 60 dias', 31,  60),
           (4,'Vencido 61 a 90 dias', 61,  90),
           (5,'Vencido mais de 90 dias', 91, 100000)
  ),
  dirs(direction) as (
    -- cast explícito: obligation_status.direction é do tipo enum obligation_direction
    select unnest(array['receivable','payable']::obligation_direction[])
  ),
  obl as (
    select direction,
           outstanding_amount as amt,
           (p_end - due_date) as age
    from obligation_status
    where organization_id = p_org_id
      and lifecycle_status = 'open'
      and outstanding_amount > 0
      and issue_date <= p_end
  ),
  -- cross join buckets x direções garante que todos os escalões saem, mesmo a zero
  agg as (
    select b.ord, b.label, d.direction,
           coalesce(sum(x.amt),0) as total
    from buckets b
    cross join dirs d
    left join obl x on x.direction = d.direction and x.age between b.lo and b.hi
    group by b.ord, b.label, d.direction
  )
  select json_build_object(
    'meta', json_build_object('report','aging','basis','cash','currency','AOA',
      'title','Mapa de Antiguidade de Saldos','start',p_start,'end',p_end,
      'cmp_start',null,'cmp_end',null,'has_comparison',false,
      'warnings', json_build_array(
        'Fotografia à data de referência: usa os saldos em aberto atuais dos documentos emitidos até essa data. Não reconstrói a posição histórica.',
        'Escalões calculados pelos dias decorridos desde a data de vencimento. Relatório interno de gestão.')),
    'sections', json_build_array(
      json_build_object('title','A receber de clientes — por antiguidade',
        'lines', (select json_agg(json_build_object('label',label,'current',total,'comparison',null,'difference',null) order by ord)
                  from agg where direction='receivable'),
        'subtotal', json_build_object('label','Total a receber',
          'current',(select coalesce(sum(total),0) from agg where direction='receivable'),
          'comparison',null,'difference',null)),
      json_build_object('title','A pagar a fornecedores — por antiguidade',
        'lines', (select json_agg(json_build_object('label',label,'current',total,'comparison',null,'difference',null) order by ord)
                  from agg where direction='payable'),
        'subtotal', json_build_object('label','Total a pagar',
          'current',(select coalesce(sum(total),0) from agg where direction='payable'),
          'comparison',null,'difference',null))
    ),
    'totals', json_build_array(
      json_build_object('label','Vencido a receber','emphasis',false,
        'current',(select coalesce(sum(total),0) from agg where direction='receivable' and ord > 1),
        'comparison',null,'difference',null),
      json_build_object('label','Posição líquida (a receber − a pagar)','emphasis',true,
        'current',(select coalesce(sum(case when direction='receivable' then total else -total end),0) from agg),
        'comparison',null,'difference',null)
    )
  ) into v_result;
  return v_result;
end; $$;

revoke execute on function report_aging(uuid, date, date, date, date) from public, anon;
grant execute on function report_aging(uuid, date, date, date, date) to authenticated;
