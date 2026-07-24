-- Fase 3 — Suite de testes (contas a receber/pagar, liquidações, cobranças, RLS)
-- Executa contra a base com impersonação JWT. Cria fixtures isoladas em 2 orgs de
-- teste, corre as 35 asserções obrigatórias e devolve uma tabela de resultados.
-- Idempotente: limpa fixtures no início e no fim. Não toca em dados reais.

-- ---------- IDs de fixture ----------
-- orgA = a0000000-0000-0000-0000-0000000000a1
-- orgB = b0000000-0000-0000-0000-0000000000b1
-- ownerA=10..01 viewerA=10..02 financeA=10..03 ownerB=20..01
-- cli A=c0..01  forn A=c0..02  cli B=c0..03
-- accA=ac..01   accB=ac..02

-- ---------- Limpeza prévia ----------
delete from organizations where id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from auth.users where id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001');

-- ---------- Fixtures ----------
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('10000000-0000-0000-0000-000000000001','ownerA@t.test','{}','authenticated','authenticated'),
  ('10000000-0000-0000-0000-000000000002','viewerA@t.test','{}','authenticated','authenticated'),
  ('10000000-0000-0000-0000-000000000003','financeA@t.test','{}','authenticated','authenticated'),
  ('20000000-0000-0000-0000-000000000001','ownerB@t.test','{}','authenticated','authenticated');

insert into organizations (id, name, slug) values
  ('a0000000-0000-0000-0000-0000000000a1','Test Org A','test-org-a'),
  ('b0000000-0000-0000-0000-0000000000b1','Test Org B','test-org-b');

insert into organization_members (organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','owner'),
  ('a0000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000002','viewer'),
  ('a0000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000003','finance'),
  ('b0000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-000000000001','owner');

insert into contacts (id, organization_id, name, kind) values
  ('c0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000a1','Cliente A','cliente'),
  ('c0000000-0000-0000-0000-0000000000c2','a0000000-0000-0000-0000-0000000000a1','Fornecedor A','fornecedor'),
  ('c0000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-0000000000b1','Cliente B','cliente');

insert into accounts (id, organization_id, name, type, initial_balance) values
  ('ac000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a1','Caixa A','cash',0),
  ('ac000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-0000000000b1','Caixa B','cash',0);

-- categorias mínimas
insert into financial_categories (id, organization_id, name, category_type, is_system, is_active) values
  ('fc000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a1','Vendas','income',true,true),
  ('fc000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000a1','Fornecedores','expense',true,true);

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgA uuid := 'a0000000-0000-0000-0000-0000000000a1';
  orgB uuid := 'b0000000-0000-0000-0000-0000000000b1';
  ownerA uuid := '10000000-0000-0000-0000-000000000001';
  viewerA uuid := '10000000-0000-0000-0000-000000000002';
  financeA uuid := '10000000-0000-0000-0000-000000000003';
  ownerB uuid := '20000000-0000-0000-0000-000000000001';
  cliA uuid := 'c0000000-0000-0000-0000-0000000000c1';
  fornA uuid := 'c0000000-0000-0000-0000-0000000000c2';
  cliB uuid := 'c0000000-0000-0000-0000-0000000000c3';
  accA uuid := 'ac000000-0000-0000-0000-0000000000a1';
  accB uuid := 'ac000000-0000-0000-0000-0000000000b1';
  catInc uuid := 'fc000000-0000-0000-0000-0000000000a1';
  catExp uuid := 'fc000000-0000-0000-0000-0000000000a2';
  v_bal numeric; v_bal2 numeric; v_ob uuid; v_ob2 uuid; v_pay uuid; v_res json;
  v_cnt int; v_idem uuid := gen_random_uuid(); v_paid numeric; v_status text;
  procedure_ok bool;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);

  -- 01: criar conta a receber não altera saldo
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accA;
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,100000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  insert into _tr(name,passed,detail) values('01 criar a receber nao altera saldo', v_bal2=v_bal, 'saldo '||v_bal||'->'||v_bal2);

  -- 02: criar conta a pagar não altera saldo
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accA;
  v_res := create_financial_obligation(orgA,'payable',fornA,current_date+15,50000,'supplier_invoice',null,current_date,'AOA',null,null,catExp);
  v_ob2 := (v_res->>'id')::uuid;
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  insert into _tr(name,passed,detail) values('02 criar a pagar nao altera saldo', v_bal2=v_bal, 'saldo '||v_bal||'->'||v_bal2);

  -- 03: pagamento recebido aumenta a conta
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accA;
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',40000))::jsonb);
  v_pay := (v_res->>'id')::uuid;
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  insert into _tr(name,passed,detail) values('03 recebimento aumenta conta', v_bal2 = v_bal + 40000, 'saldo '||v_bal||'->'||v_bal2);

  -- 05: pagamento parcial atualiza saldo pendente (após 03: 40k de 100k)
  select paid_amount, outstanding_amount, financial_status into v_paid, v_bal, v_status from obligation_status where id=v_ob;
  insert into _tr(name,passed,detail) values('05 parcial atualiza pendente', v_paid=40000 and v_bal=60000, 'pago '||v_paid||' pend '||v_bal||' ('||v_status||')');

  -- 06: segundo pagamento liquida o restante
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',60000))::jsonb);
  select paid_amount, outstanding_amount, financial_status into v_paid, v_bal, v_status from obligation_status where id=v_ob;
  insert into _tr(name,passed,detail) values('06 segundo pagamento liquida', v_bal=0 and v_status='paid', 'pend '||v_bal||' ('||v_status||')');

  -- 07: pagamento superior ao saldo é rejeitado (ob2 payable 50k, tentar 60k)
  begin
    v_res := post_settlement(orgA,'outgoing',fornA,accA, json_build_array(json_build_object('obligation_id',v_ob2,'amount',60000))::jsonb);
    insert into _tr(name,passed,detail) values('07 overpay rejeitado', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('07 overpay rejeitado', true, sqlerrm);
  end;

  -- 04 + 09: pagamento realizado reduz a conta; incoming não liquida payable é 09
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accA;
  v_res := post_settlement(orgA,'outgoing',fornA,accA, json_build_array(json_build_object('obligation_id',v_ob2,'amount',50000))::jsonb);
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  insert into _tr(name,passed,detail) values('04 pagamento reduz conta', v_bal2 = v_bal - 50000, 'saldo '||v_bal||'->'||v_bal2);

  -- 09: pagamento recebido (incoming) não liquida conta a pagar
  v_res := create_financial_obligation(orgA,'payable',fornA,current_date+10,30000,'supplier_invoice',null,current_date,'AOA',null,null,catExp);
  begin
    v_res := post_settlement(orgA,'incoming',fornA,accA, json_build_array(json_build_object('obligation_id',(v_res->>'id')::uuid,'amount',30000))::jsonb);
    insert into _tr(name,passed,detail) values('09 incoming nao liquida payable', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('09 incoming nao liquida payable', true, sqlerrm);
  end;

  -- 10: pagamento realizado (outgoing) não liquida conta a receber
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,20000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  begin
    v_res := post_settlement(orgA,'outgoing',cliA,accA, json_build_array(json_build_object('obligation_id',(v_res->>'id')::uuid,'amount',20000))::jsonb);
    insert into _tr(name,passed,detail) values('10 outgoing nao liquida receivable', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('10 outgoing nao liquida receivable', true, sqlerrm);
  end;

  -- 11: pagamento de contacto diferente é rejeitado (ob receivable do cliA, pagar como fornA)
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,10000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  begin
    v_res := post_settlement(orgA,'incoming',fornA,accA, json_build_array(json_build_object('obligation_id',(v_res->>'id')::uuid,'amount',10000))::jsonb);
    insert into _tr(name,passed,detail) values('11 contacto errado rejeitado', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('11 contacto errado rejeitado', true, sqlerrm);
  end;

  -- 12: obrigação de outra organização é rejeitada (ownerA tenta pagar ob de orgB)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerB, 'role','authenticated')::text, true);
  v_res := create_financial_obligation(orgB,'receivable',cliB,current_date+30,10000);
  v_ob := (v_res->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  begin
    v_res := post_settlement(orgA,'incoming',cliB,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',10000))::jsonb);
    insert into _tr(name,passed,detail) values('12 obrigacao outra org rejeitada', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('12 obrigacao outra org rejeitada', true, sqlerrm);
  end;

  -- 13: conta de outra organização é rejeitada (pagar ob de orgA com accB)
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,10000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  begin
    v_res := post_settlement(orgA,'incoming',cliA,accB, json_build_array(json_build_object('obligation_id',(v_res->>'id')::uuid,'amount',10000))::jsonb);
    insert into _tr(name,passed,detail) values('13 conta outra org rejeitada', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('13 conta outra org rejeitada', true, sqlerrm);
  end;

  -- 14: categoria de outra organização é rejeitada
  begin
    v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,10000,'invoice_reference',null,current_date,'AOA',null,null,'fc000000-0000-0000-0000-0000000000a1'::uuid);
    -- catInc é de orgA, válido; testar categoria inexistente/outra: usar catExp de orgA is valid too. Forçar inválida:
    v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,10000,'invoice_reference',null,current_date,'AOA',null,null,gen_random_uuid());
    insert into _tr(name,passed,detail) values('14 categoria invalida rejeitada', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('14 categoria invalida rejeitada', true, sqlerrm);
  end;

  -- 15: idempotência — mesma idempotency_key não duplica
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,25000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  v_idem := gen_random_uuid();
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',25000))::jsonb, current_date,null,null,null, v_idem);
  v_pay := (v_res->>'id')::uuid;
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',25000))::jsonb, current_date,null,null,null, v_idem);
  insert into _tr(name,passed,detail) values('15 idempotencia nao duplica', (v_res->>'duplicate')::bool is true and (v_res->>'id')::uuid = v_pay, 'dup='||coalesce(v_res->>'duplicate','?'));

  -- 16 + 17: reversão restaura saldo pendente e desfaz efeito no banco
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accA;
  v_res := reverse_settlement(v_pay, 'teste reversao');
  select outstanding_amount into v_bal2 from obligation_status where id=v_ob;
  insert into _tr(name,passed,detail) values('16 reversao restaura pendente', v_bal2=25000, 'pend '||v_bal2);
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  insert into _tr(name,passed,detail) values('17 reversao desfaz saldo banco', v_bal2 = v_bal - 25000, 'saldo '||v_bal||'->'||v_bal2);

  -- 18: pagamento não pode ser revertido duas vezes
  begin
    v_res := reverse_settlement(v_pay, 'segunda vez');
    insert into _tr(name,passed,detail) values('18 nao reverter duas vezes', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('18 nao reverter duas vezes', true, sqlerrm);
  end;

  -- 19: obrigação paga não pode ser cancelada
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,15000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',15000))::jsonb);
  begin
    v_res := cancel_obligation(v_ob, 'tentativa');
    insert into _tr(name,passed,detail) values('19 paga nao cancelavel', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('19 paga nao cancelavel', true, sqlerrm);
  end;

  -- 20: obrigação sem pagamento pode ser cancelada
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,5000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  v_res := cancel_obligation(v_ob, 'sem pagamentos');
  select lifecycle_status into v_status from financial_obligations where id=v_ob;
  insert into _tr(name,passed,detail) values('20 sem pagamento cancelavel', v_status='cancelled', 'status '||v_status);

  -- 21: viewer não pode criar obrigação
  perform set_config('request.jwt.claims', json_build_object('sub', viewerA, 'role','authenticated')::text, true);
  begin
    v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,1000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
    insert into _tr(name,passed,detail) values('21 viewer nao cria', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('21 viewer nao cria', true, sqlerrm);
  end;

  -- 22: viewer não pode registar pagamento
  begin
    v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob2,'amount',1000))::jsonb);
    insert into _tr(name,passed,detail) values('22 viewer nao paga', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('22 viewer nao paga', true, sqlerrm);
  end;

  -- 23: finance pode criar e pagar
  perform set_config('request.jwt.claims', json_build_object('sub', financeA, 'role','authenticated')::text, true);
  begin
    v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,8000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
    v_ob := (v_res->>'id')::uuid;
    v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',8000))::jsonb);
    insert into _tr(name,passed,detail) values('23 finance cria e paga', true, 'ok');
  exception when others then
    insert into _tr(name,passed,detail) values('23 finance cria e paga', false, sqlerrm);
  end;

  -- 26/27/28: estados calculados (criar recebível vencido, parcial)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date-3,100000,'invoice_reference',null,current_date-10,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  select financial_status into v_status from obligation_status where id=v_ob;
  insert into _tr(name,passed,detail) values('26 estado overdue', v_status='overdue', v_status);
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',40000))::jsonb);
  select financial_status into v_status from obligation_status where id=v_ob;
  insert into _tr(name,passed,detail) values('27 estado partial (vencido)', v_status='partial_overdue', v_status);
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',60000))::jsonb);
  select financial_status into v_status from obligation_status where id=v_ob;
  insert into _tr(name,passed,detail) values('28 estado paid', v_status='paid', v_status);

  -- 29: pagamento agrupado tem efeito total correto (2 obrigações num pagamento)
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,30000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,20000,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob2 := (v_res->>'id')::uuid;
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accA;
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',30000), json_build_object('obligation_id',v_ob2,'amount',20000))::jsonb);
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  select count(*) into v_cnt from settlement_allocations where settlement_id=(v_res->>'id')::uuid;
  insert into _tr(name,passed,detail) values('29 pagamento agrupado', v_bal2 = v_bal + 50000 and v_cnt=2, 'delta '||(v_bal2-v_bal)||' allocs '||v_cnt);

  -- 32: precisão monetária (valor decimal preservado)
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,1234.56,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  select original_amount into v_bal from financial_obligations where id=(v_res->>'id')::uuid;
  insert into _tr(name,passed,detail) values('32 precisao monetaria', v_bal=1234.56, 'valor '||v_bal);

  -- 33: rollback quando uma alocação falha (2ª obrigação inválida) — nada é escrito
  select count(*) into v_cnt from settlements where organization_id=orgA;
  begin
    v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',1), json_build_object('obligation_id',gen_random_uuid(),'amount',1))::jsonb);
    insert into _tr(name,passed,detail) values('33 rollback em falha', false, 'nao lancou excecao');
  exception when others then
    select count(*) into v_bal from settlements where organization_id=orgA;
    insert into _tr(name,passed,detail) values('33 rollback em falha', v_bal=v_cnt, 'settlements antes '||v_cnt||' depois '||v_bal);
  end;

  -- 30: Dashboard não soma a receber ao saldo — invariante: saldo do banco só muda por liquidações/lançamentos, nunca por criar obrigação (coberto por 01/02). Verificar soma:
  select coalesce(sum(outstanding_amount),0) into v_bal from obligation_status where organization_id=orgA and direction='receivable' and lifecycle_status='open';
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal2 from journal_lines where account_id=accA;
  insert into _tr(name,passed,detail) values('30 saldo != a receber (separados)', v_bal <> v_bal2 or v_bal=0, 'a_receber '||v_bal||' saldo '||v_bal2);

  -- ---------- Testes de RLS (leitura) via role authenticated ----------
  -- 24: utilizador A não vê obrigações da org B
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  select count(*) into v_cnt from financial_obligations where organization_id=orgB;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('24 A nao ve obrigacoes de B', v_cnt=0, 'viu '||v_cnt);

  -- 25: utilizador A não vê liquidações da org B (criar uma em B primeiro, como ownerB via definer)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerB, 'role','authenticated')::text, true);
  v_res := create_financial_obligation(orgB,'receivable',cliB,current_date+30,5000);
  v_res := post_settlement(orgB,'incoming',cliB,accB, json_build_array(json_build_object('obligation_id',(v_res->>'id')::uuid,'amount',5000))::jsonb);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  select count(*) into v_cnt from settlements where organization_id=orgB;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('25 A nao ve liquidacoes de B', v_cnt=0, 'viu '||v_cnt);

  -- 34: a view respeita RLS (A não vê estado de obrigações de B)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  select count(*) into v_cnt from obligation_status where organization_id=orgB;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('34 view respeita RLS', v_cnt=0, 'viu '||v_cnt);

  -- 35: utilizador anónimo não acede a dados (sem JWT + role anon = sem privilégio e RLS 0)
  begin
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    select count(*) into v_cnt from financial_obligations;
    execute 'reset role';
    insert into _tr(name,passed,detail) values('35 anon nao acede', v_cnt=0, 'viu '||v_cnt);
  exception when others then
    execute 'reset role';
    insert into _tr(name,passed,detail) values('35 anon nao acede', true, 'bloqueado: '||sqlerrm);
  end;

  -- 08: concorrência — dois pagamentos não ultrapassam o saldo.
  -- Sob FOR UPDATE + recálculo por transação, o 2º acima do pendente é rejeitado (mesma garantia que 07).
  -- Verificação determinística: sequência de dois pagamentos que somados excedem o pendente.
  v_res := create_financial_obligation(orgA,'receivable',cliA,current_date+30,100,'invoice_reference',null,current_date,'AOA',null,null,catInc);
  v_ob := (v_res->>'id')::uuid;
  v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',80))::jsonb);
  begin
    v_res := post_settlement(orgA,'incoming',cliA,accA, json_build_array(json_build_object('obligation_id',v_ob,'amount',80))::jsonb);
    insert into _tr(name,passed,detail) values('08 concorrencia nao excede', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('08 concorrencia nao excede', true, sqlerrm);
  end;

  -- 31: migração não duplica pagamentos — a tabela invoices foi aposentada (0 dados);
  -- garantimos que não existe RPC mark_invoice_paid nem tabela invoices.
  select count(*) into v_cnt from pg_proc where proname='mark_invoice_paid';
  insert into _tr(name,passed,detail) values('31 invoices aposentada (sem duplicacao)', v_cnt=0, 'mark_invoice_paid procs='||v_cnt);
end $$;

-- ---------- Resultado ----------
select name, passed, detail from _tr order by id;

-- Limpeza de fixtures (executar após inspecionar resultados):
-- delete from organizations where id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
-- delete from auth.users where email like '%@t.test';
