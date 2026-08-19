-- Fase 5: settlements/settlement_allocations distinguem empréstimo de
-- recebível normal. Reaproveita as liquidações já criadas no phase12
-- (T6 cobrador recebeu recebível normal; T8 rh recebeu devolução de
-- empréstimo) — encontra-as por document_kind em vez de por id fixo.

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  ownerF uuid := 'f2000000-0000-0000-0000-000000000001';
  cobradorF uuid := 'f2000000-0000-0000-0000-000000000008';
  rhF uuid := 'f2000000-0000-0000-0000-000000000007';
  v_loan_alloc_id uuid;
  v_normal_alloc_id uuid;
  v_cnt int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  select sa.id into v_loan_alloc_id
    from settlement_allocations sa join financial_obligations fo on fo.id = sa.obligation_id
    where sa.organization_id = orgF and fo.document_kind in ('employee_loan','salary_advance')
    limit 1;
  select sa.id into v_normal_alloc_id
    from settlement_allocations sa join financial_obligations fo on fo.id = sa.obligation_id
    where sa.organization_id = orgF and fo.document_kind not in ('employee_loan','salary_advance') and fo.direction = 'receivable'
    limit 1;

  insert into _tr(name,passed,detail) values('setup: fixtures do phase12 encontradas', v_loan_alloc_id is not null and v_normal_alloc_id is not null,
    'loan_alloc='||coalesce(v_loan_alloc_id::text,'NULL')||' normal_alloc='||coalesce(v_normal_alloc_id::text,'NULL'));

  -- T1: cobrador NAO ve a linha de alocacao de emprestimo (fecha o vazamento)
  -- RLS so e aplicado a role 'authenticated' de facto — a ligacao deste
  -- teste corre como dono/superuser, por isso 'set local role authenticated'
  -- e obrigatorio a volta de cada SELECT sensivel (mesmo padrao do phase10).
  perform set_config('request.jwt.claims', json_build_object('sub', cobradorF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from settlement_allocations where id = v_loan_alloc_id;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T1 cobrador NAO ve alocacao de emprestimo (fecha vazamento)', v_cnt = 0, 'viu '||v_cnt||' linhas');

  -- T2: cobrador continua a ver a sua propria alocacao de recebivel normal (regressao)
  execute 'set local role authenticated';
  select count(*) into v_cnt from settlement_allocations where id = v_normal_alloc_id;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T2 cobrador ve alocacao de recebivel normal (regressao)', v_cnt = 1, 'viu '||v_cnt||' linhas');

  -- T3: rh (tem loans) ve a alocacao de emprestimo
  perform set_config('request.jwt.claims', json_build_object('sub', rhF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from settlement_allocations where id = v_loan_alloc_id;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T3 rh ve alocacao de emprestimo', v_cnt = 1, 'viu '||v_cnt||' linhas');

  -- T4: rh NAO ve a alocacao de recebivel normal (nao tem obligations_receivable)
  execute 'set local role authenticated';
  select count(*) into v_cnt from settlement_allocations where id = v_normal_alloc_id;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T4 rh NAO ve alocacao de recebivel normal (papel errado)', v_cnt = 0, 'viu '||v_cnt||' linhas');

  -- T5: owner ve tudo (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from settlement_allocations where id in (v_loan_alloc_id, v_normal_alloc_id);
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T5 owner ve as duas (regressao)', v_cnt = 2, 'viu '||v_cnt||' linhas');

  -- T6: cabecalho settlements continua visivel a cobrador para o pagamento que ele proprio fez
  perform set_config('request.jwt.claims', json_build_object('sub', cobradorF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from settlements s
    where s.id = (select settlement_id from settlement_allocations where id = v_normal_alloc_id);
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T6 cobrador ve cabecalho do seu proprio pagamento', v_cnt = 1, 'viu '||v_cnt);
end $$;

select id, name, passed, detail from _tr order by id;
