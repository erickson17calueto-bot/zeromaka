-- Fase 5 — Suite de testes dos relatórios
-- Cobre: Resultado de Caixa, Antiguidade de Saldos, drill-down, Extrato de Conta
-- e o isolamento entre organizações (RLS). Impersonação JWT, 2 orgs.
-- Fixtures isoladas (orgs a5/b5), criadas e limpas pelo próprio ficheiro.
--
-- Correr: psql -f supabase/tests/phase5_reports.test.sql
-- Devolve uma tabela com uma linha por asserção (passed = true/false).

-- ─────────────── limpeza de execuções anteriores ───────────────
set session_replication_role = replica;
delete from audit_logs             where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from report_exports         where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from settlement_allocations where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from settlements            where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from financial_obligations  where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from journal_lines          where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from journal_entries        where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from accounts               where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from contacts               where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from organization_members   where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from companies              where organization_id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from organizations          where id in ('a5000000-0000-0000-0000-0000000000a1','b5000000-0000-0000-0000-0000000000b1');
delete from auth.users where email like '%@t5.test';
set session_replication_role = origin;

-- ─────────────── fixtures ───────────────
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('15000000-0000-0000-0000-000000000001','ownerA@t5.test','{}','authenticated','authenticated'),
  ('25000000-0000-0000-0000-000000000001','ownerB@t5.test','{}','authenticated','authenticated');
insert into organizations (id, name, slug) values
  ('a5000000-0000-0000-0000-0000000000a1','Test Org A5','test-org-a5'),
  ('b5000000-0000-0000-0000-0000000000b1','Test Org B5','test-org-b5');
insert into organization_members (organization_id, user_id, role) values
  ('a5000000-0000-0000-0000-0000000000a1','15000000-0000-0000-0000-000000000001','owner'),
  ('b5000000-0000-0000-0000-0000000000b1','25000000-0000-0000-0000-000000000001','owner');
insert into contacts (id, organization_id, name, kind) values
  ('c5000000-0000-0000-0000-0000000000c1','a5000000-0000-0000-0000-0000000000a1','Cliente A5','cliente'),
  ('c5000000-0000-0000-0000-0000000000c2','a5000000-0000-0000-0000-0000000000a1','Fornecedor A5','fornecedor');
insert into accounts (id, organization_id, name, type, initial_balance) values
  ('a5c00000-0000-0000-0000-0000000000a1','a5000000-0000-0000-0000-0000000000a1','BAI A5','bank',0),
  ('b5c00000-0000-0000-0000-0000000000b1','b5000000-0000-0000-0000-0000000000b1','BancoB5','bank',0);

-- Lançamentos. Período em teste: 2026-03-01 a 2026-03-31.
-- Comparação: 2026-02-01 a 2026-02-28.
insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, status, source, created_by, idempotency_key, metadata) values
  -- E1: abertura ANTES do período (entra no saldo inicial do extrato)
  ('e5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950001','opening_balance',date '2026-01-10','Abertura BAI A5','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{}'),
  -- E2: venda COM imposto (101.000 brutos, 1.000 de imposto -> 100.000 líquidos)
  ('e5000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950002','income',date '2026-03-05','Venda com imposto','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Vendas","is_sale":true,"tax_amount":1000}'),
  -- E3: receita sem imposto
  ('e5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950003','income',date '2026-03-10','Serviço sem imposto','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Serviços"}'),
  -- E4: despesa
  ('e5000000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950004','expense',date '2026-03-12','Renda do mês','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Renda"}'),
  -- E5: capital dos sócios — NÃO deve entrar no resultado
  ('e5000000-0000-0000-0000-000000000005','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950005','income',date '2026-03-15','Entrada de capital','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Capital","type":"capital_in"}'),
  -- E6: receita no período de COMPARAÇÃO
  ('e5000000-0000-0000-0000-000000000006','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950006','income',date '2026-02-20','Venda de fevereiro','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Vendas"}'),
  -- E7: receita FORA do período (abril) — não deve entrar
  ('e5000000-0000-0000-0000-000000000007','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950007','income',date '2026-04-05','Venda de abril','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Vendas"}'),
  -- E8/E9: despesa estornada + o respetivo estorno (anulam-se)
  ('e5000000-0000-0000-0000-000000000008','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950008','expense',date '2026-03-20','Renda estornada','reversed','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Renda"}'),
  ('e5000000-0000-0000-0000-000000000009','a5000000-0000-0000-0000-0000000000a1','MOV-2026-950009','reversal',date '2026-03-20','Estorno da renda','posted','seed','15000000-0000-0000-0000-000000000001',gen_random_uuid(),'{"category":"Renda"}');

insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000001','a5c00000-0000-0000-0000-0000000000a1','debit', 1000000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000002','a5c00000-0000-0000-0000-0000000000a1','debit',  101000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000003','a5c00000-0000-0000-0000-0000000000a1','debit',   50000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000004','a5c00000-0000-0000-0000-0000000000a1','credit',  30000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000005','a5c00000-0000-0000-0000-0000000000a1','debit',  200000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000006','a5c00000-0000-0000-0000-0000000000a1','debit',   40000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000007','a5c00000-0000-0000-0000-0000000000a1','debit',  999000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000008','a5c00000-0000-0000-0000-0000000000a1','credit',  70000),
  ('a5000000-0000-0000-0000-0000000000a1','e5000000-0000-0000-0000-000000000009','a5c00000-0000-0000-0000-0000000000a1','debit',   70000);

-- Faturas para a antiguidade de saldos. Data de referência: 2026-03-31.
-- NB: obligation_lifecycle só tem 'open' e 'cancelled'. Uma fatura totalmente
-- paga permanece 'open' com outstanding_amount = 0 e é excluída por esse filtro
-- (esse caminho é exercitado pela suite da fase 3, que cria liquidações reais).
-- Aqui testamos a exclusão por 'cancelled'.
insert into financial_obligations (id, organization_id, direction, contact_id, internal_number, document_kind, issue_date, due_date, original_amount, currency_code, description, lifecycle_status, is_sale, tax_amount, created_by) values
  ('05000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-0000000000a1','receivable','c5000000-0000-0000-0000-0000000000c1','REC-T5-0001','product_sale',date '2026-01-05',date '2026-04-15',100000,'AOA','Corrente','open',false,0,'15000000-0000-0000-0000-000000000001'),
  ('05000000-0000-0000-0000-000000000002','a5000000-0000-0000-0000-0000000000a1','receivable','c5000000-0000-0000-0000-0000000000c1','REC-T5-0002','product_sale',date '2026-01-05',date '2026-03-20', 50000,'AOA','Vencido 11d','open',false,0,'15000000-0000-0000-0000-000000000001'),
  ('05000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-0000000000a1','receivable','c5000000-0000-0000-0000-0000000000c1','REC-T5-0003','product_sale',date '2026-01-05',date '2026-01-15', 20000,'AOA','Vencido 75d','open',false,0,'15000000-0000-0000-0000-000000000001'),
  -- emissão anterior ao vencimento (a BD impõe due_date >= issue_date)
  ('05000000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-0000000000a1','receivable','c5000000-0000-0000-0000-0000000000c1','REC-T5-0004','product_sale',date '2025-09-01',date '2025-10-01', 30000,'AOA','Vencido 181d','open',false,0,'15000000-0000-0000-0000-000000000001'),
  ('05000000-0000-0000-0000-000000000005','a5000000-0000-0000-0000-0000000000a1','payable',   'c5000000-0000-0000-0000-0000000000c2','PAG-T5-0001','supplier_invoice',date '2026-01-05',date '2026-03-25', 80000,'AOA','A pagar 6d','open',false,0,'15000000-0000-0000-0000-000000000001'),
  -- cancelada: NÃO deve aparecer na antiguidade
  ('05000000-0000-0000-0000-000000000006','a5000000-0000-0000-0000-0000000000a1','receivable','c5000000-0000-0000-0000-0000000000c1','REC-T5-0006','product_sale',date '2026-01-05',date '2026-03-10',999000,'AOA','Cancelada','cancelled',false,0,'15000000-0000-0000-0000-000000000001');

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  v_org  uuid := 'a5000000-0000-0000-0000-0000000000a1';
  v_orgb uuid := 'b5000000-0000-0000-0000-0000000000b1';
  v_acc  uuid := 'a5c00000-0000-0000-0000-0000000000a1';
  v_accb uuid := 'b5c00000-0000-0000-0000-0000000000b1';
  s date := date '2026-03-01';
  e date := date '2026-03-31';
  cs date := date '2026-02-01';
  ce date := date '2026-02-28';
  r json; d json; lg json;
  n numeric; m numeric;
  t text;
  ok boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','15000000-0000-0000-0000-000000000001','role','authenticated')::text, true);

  -- ══════════ Resultado de Caixa ══════════
  r := report_income_cash(v_org, s, e, cs, ce);

  n := (r->'sections'->0->'subtotal'->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('01 receita total do periodo', n = 150000, 'obtido '||n||' esperado 150000');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vendas';
  insert into _tr(name,passed,detail) values
    ('02 venda liquida de imposto', n = 100000, 'obtido '||coalesce(n::text,'null')||' esperado 100000 (101000-1000)');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Serviços';
  insert into _tr(name,passed,detail) values
    ('03 receita sem imposto pelo total', n = 50000, 'obtido '||coalesce(n::text,'null')||' esperado 50000');

  n := (r->'sections'->1->'subtotal'->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('04 despesas negativas', n = -30000, 'obtido '||n||' esperado -30000');

  n := (r->'totals'->0->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('05 resultado = receitas - despesas', n = 120000, 'obtido '||n||' esperado 120000');

  select count(*) into n from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Capital';
  insert into _tr(name,passed,detail) values
    ('06 capital dos socios nao entra', n = 0, 'linhas de Capital: '||n);

  select (l->>'comparison')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vendas';
  insert into _tr(name,passed,detail) values
    ('07 comparacao preenchida', n = 40000, 'obtido '||coalesce(n::text,'null')||' esperado 40000');

  insert into _tr(name,passed,detail) values
    ('08 lancamento fora do periodo excluido',
     (r->'sections'->0->'subtotal'->>'current')::numeric = 150000, 'abril (999000) nao entrou');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->1->'lines') l where l->>'label' = 'Renda';
  insert into _tr(name,passed,detail) values
    ('09 estornado nao conta no resultado', n = -30000, 'obtido '||coalesce(n::text,'null')||' esperado -30000 (nao -100000)');

  insert into _tr(name,passed,detail) values
    ('10 has_comparison verdadeiro', (r->'meta'->>'has_comparison')::boolean, 'meta.has_comparison');

  -- sem comparação: colunas a null
  r := report_income_cash(v_org, s, e);
  select (l->>'comparison') is null into ok
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vendas';
  insert into _tr(name,passed,detail) values
    ('11 sem comparacao devolve null', ok, 'comparison null quando nao pedida');

  -- chaves para drill-down
  select (l->>'key') into t
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vendas';
  insert into _tr(name,passed,detail) values
    ('12 linha traz chave de detalhe', t = 'income:Vendas', 'key '||coalesce(t,'null'));

  -- ══════════ Antiguidade de Saldos ══════════
  r := report_aging(v_org, s, e);

  select count(*) into n from json_array_elements(r->'sections'->0->'lines');
  insert into _tr(name,passed,detail) values
    ('13 cinco escaloes sempre presentes', n = 5, 'escaloes: '||n);

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Corrente (ainda por vencer)';
  insert into _tr(name,passed,detail) values
    ('14 escalao corrente', n = 100000, 'obtido '||n||' esperado 100000');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vencido 1 a 30 dias';
  insert into _tr(name,passed,detail) values
    ('15 escalao 1-30 dias', n = 50000, 'obtido '||n||' esperado 50000');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vencido 31 a 60 dias';
  insert into _tr(name,passed,detail) values
    ('16 escalao vazio aparece a zero', n = 0, 'obtido '||n||' esperado 0 (presente, nao omitido)');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vencido 61 a 90 dias';
  insert into _tr(name,passed,detail) values
    ('17 escalao 61-90 dias', n = 20000, 'obtido '||n||' esperado 20000');

  select (l->>'current')::numeric into n
  from json_array_elements(r->'sections'->0->'lines') l where l->>'label' = 'Vencido mais de 90 dias';
  insert into _tr(name,passed,detail) values
    ('18 escalao +90 dias', n = 30000, 'obtido '||n||' esperado 30000');

  n := (r->'sections'->0->'subtotal'->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('19 total a receber = soma dos escaloes', n = 200000, 'obtido '||n||' esperado 200000');

  n := (r->'sections'->1->'subtotal'->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('20 total a pagar', n = 80000, 'obtido '||n||' esperado 80000');

  n := (r->'totals'->0->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('21 vencido exclui o corrente', n = 100000, 'obtido '||n||' esperado 100000');

  n := (r->'totals'->1->>'current')::numeric;
  insert into _tr(name,passed,detail) values
    ('22 posicao liquida = receber - pagar', n = 120000, 'obtido '||n||' esperado 120000');

  insert into _tr(name,passed,detail) values
    ('23 fatura cancelada nao entra',
     (r->'sections'->0->'subtotal'->>'current')::numeric = 200000, 'a cancelada (999000) ficou de fora');

  -- ══════════ Drill-down ══════════
  d := report_drilldown(v_org, 'income_statement', 'income:Vendas', s, e);
  n := (d->>'total')::numeric;
  insert into _tr(name,passed,detail) values
    ('24 detalhe da receita reconcilia', n = 100000, 'detalhe '||n||' = linha 100000');

  select count(*) into m from json_array_elements(d->'rows');
  insert into _tr(name,passed,detail) values
    ('25 detalhe traz o documento', m = 1, 'documentos: '||m);

  d := report_drilldown(v_org, 'income_statement', 'expense:Renda', s, e);
  insert into _tr(name,passed,detail) values
    ('26 detalhe da despesa exclui estornado', (d->>'total')::numeric = 30000,
     'detalhe '||(d->>'total')||' esperado 30000');

  d := report_drilldown(v_org, 'aging', 'receivable:2', s, e);
  insert into _tr(name,passed,detail) values
    ('27 detalhe da antiguidade reconcilia', (d->>'total')::numeric = 50000,
     'detalhe '||(d->>'total')||' = escalao 50000');

  begin
    d := report_drilldown(v_org, 'income_statement', 'chave:invalida', s, e);
    insert into _tr(name,passed,detail) values('28 chave invalida da erro', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('28 chave invalida da erro', true, 'excecao: '||left(SQLERRM,40));
  end;

  -- ══════════ Extrato de Conta ══════════
  lg := report_account_ledger(v_org, s, e, v_acc);

  -- Saldo inicial = E1 abertura (1.000.000) + E6 venda de fevereiro (40.000),
  -- ambos anteriores a 2026-03-01. E6 serve de comparação no Resultado de Caixa
  -- mas, para o extrato de março, é passado — logo entra no saldo inicial.
  insert into _tr(name,passed,detail) values
    ('29 saldo inicial = movimentos anteriores', (lg->>'opening')::numeric = 1040000,
     'obtido '||(lg->>'opening')||' esperado 1040000 (1000000 abertura + 40000 fevereiro)');

  insert into _tr(name,passed,detail) values
    ('30 entradas do periodo', (lg->>'inflow')::numeric = 421000,
     'obtido '||(lg->>'inflow')||' esperado 421000');

  insert into _tr(name,passed,detail) values
    ('31 saidas do periodo', (lg->>'outflow')::numeric = 100000,
     'obtido '||(lg->>'outflow')||' esperado 100000');

  insert into _tr(name,passed,detail) values
    ('32 saldo final = inicial + entradas - saidas',
     (lg->>'closing')::numeric = (lg->>'opening')::numeric + (lg->>'inflow')::numeric - (lg->>'outflow')::numeric
     and (lg->>'closing')::numeric = 1361000,
     'obtido '||(lg->>'closing')||' esperado 1361000 (1040000 + 421000 - 100000)');

  -- último saldo corrido tem de aterrar no saldo final
  select (l->>'saldo')::numeric into n
  from json_array_elements(lg->'rows') with ordinality t(l, i)
  order by i desc limit 1;
  insert into _tr(name,passed,detail) values
    ('33 ultimo saldo corrido = saldo final', n = (lg->>'closing')::numeric,
     'corrido '||coalesce(n::text,'null')||' final '||(lg->>'closing'));

  -- estorno visível no extrato (ao contrário do resultado)
  select count(*) into n from json_array_elements(lg->'rows') l
  where l->>'estado' = 'reversed' or l->>'tipo' = 'reversal';
  insert into _tr(name,passed,detail) values
    ('34 estorno visivel no extrato', n = 2, 'linhas de estorno: '||n||' esperado 2');

  -- extrato completo bate com o saldo autoritativo da conta
  lg := report_account_ledger(v_org, date '2000-01-01', date '2030-12-31', v_acc);
  select coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end),0) into m
  from journal_lines jl where jl.account_id = v_acc;
  insert into _tr(name,passed,detail) values
    ('35 saldo final = saldo autoritativo da conta', (lg->>'closing')::numeric = m,
     'extrato '||(lg->>'closing')||' autoritativo '||m);

  -- ══════════ Validações e isolamento entre organizações ══════════
  begin
    lg := report_account_ledger(v_org, s, e, v_accb);  -- conta de OUTRA org
    insert into _tr(name,passed,detail) values('36 extrato rejeita conta de outra org', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('36 extrato rejeita conta de outra org', true, 'excecao: '||left(SQLERRM,40));
  end;

  begin
    lg := report_account_ledger(v_org, s, e, null);
    insert into _tr(name,passed,detail) values('37 extrato exige conta', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('37 extrato exige conta', true, 'excecao: '||left(SQLERRM,40));
  end;

  begin
    r := report_income_cash(v_org, e, s);  -- datas invertidas
    insert into _tr(name,passed,detail) values('38 datas invertidas dao erro', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('38 datas invertidas dao erro', true, 'excecao: '||left(SQLERRM,40));
  end;

  -- utilizador da org B não pode ler relatórios da org A
  perform set_config('request.jwt.claims',
    json_build_object('sub','25000000-0000-0000-0000-000000000001','role','authenticated')::text, true);

  begin
    r := report_income_cash(v_org, s, e);
    insert into _tr(name,passed,detail) values('39 org B nao le resultado da org A', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('39 org B nao le resultado da org A', true, 'excecao: '||left(SQLERRM,40));
  end;

  begin
    r := report_aging(v_org, s, e);
    insert into _tr(name,passed,detail) values('40 org B nao le antiguidade da org A', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('40 org B nao le antiguidade da org A', true, 'excecao: '||left(SQLERRM,40));
  end;

  begin
    d := report_drilldown(v_org, 'aging', 'receivable:2', s, e);
    insert into _tr(name,passed,detail) values('41 org B nao le detalhe da org A', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('41 org B nao le detalhe da org A', true, 'excecao: '||left(SQLERRM,40));
  end;

  begin
    lg := report_account_ledger(v_org, s, e, v_acc);
    insert into _tr(name,passed,detail) values('42 org B nao le extrato da org A', false, 'nao levantou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('42 org B nao le extrato da org A', true, 'excecao: '||left(SQLERRM,40));
  end;
end $$;

-- ─────────────── resultados ───────────────
select id, name,
       case when passed then 'PASS' else 'FALHOU' end as resultado,
       detail
from _tr order by id;

select count(*) filter (where passed) as passaram,
       count(*) filter (where not passed) as falharam,
       count(*) as total
from _tr;
