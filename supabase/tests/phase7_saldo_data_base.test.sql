-- Fase 7 — saldo atual com data-base (current_account_balance) + regras de
-- faturas/settlements não afetarem caixa antes da liquidação.
-- Mesmo formato dos testes de Fase 4: fixtures isoladas em test-org-c, tabela
-- de resultados _tr.

set session_replication_role = replica;
delete from settlement_allocations where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from settlements where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from financial_obligations where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from journal_lines where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from journal_entries where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from accounts where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from contacts where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from organization_members where organization_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from organizations where id = 'c0000000-0000-0000-0000-0000000000c1';
delete from auth.users where email like '%@t7.test';
set session_replication_role = origin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('30000000-0000-0000-0000-000000000001','ownerC@t7.test','{}','authenticated','authenticated');
insert into organizations (id, name, slug) values
  ('c0000000-0000-0000-0000-0000000000c1','Test Org C','test-org-c');
insert into organization_members (organization_id, user_id, role) values
  ('c0000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-000000000001','owner');
insert into contacts (id, organization_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c1','Cliente C','cliente'),
  ('d0000000-0000-0000-0000-0000000000d2','c0000000-0000-0000-0000-0000000000c1','Fornecedor C','fornecedor');
insert into accounts (id, organization_id, name, type, initial_balance) values
  ('e0000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000c1','BAI C','bank',1000000),
  ('e0000000-0000-0000-0000-0000000000e2','c0000000-0000-0000-0000-0000000000c1','Sem abertura','bank',0);

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  org uuid := 'c0000000-0000-0000-0000-0000000000c1';
  owner uuid := '30000000-0000-0000-0000-000000000001';
  cli uuid := 'd0000000-0000-0000-0000-0000000000d1';
  forn uuid := 'd0000000-0000-0000-0000-0000000000d2';
  accBAI uuid := 'e0000000-0000-0000-0000-0000000000e1';
  accSemAbertura uuid := 'e0000000-0000-0000-0000-0000000000e2';
  v json; v_bal numeric; v_eid uuid; v_ob uuid; v_rev json;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);

  -- 01: saldo de abertura de hoje (1M, do INSERT em accounts acima não gera
  -- opening_balance sozinho — criamos o lançamento a mão, como faria
  -- create_account_with_balance).
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('f0000000-0000-0000-0000-0000000000f1', org, 'MOV-T7-0001', 'opening_balance', current_date, 'Abertura BAI C', 'seed', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'f0000000-0000-0000-0000-0000000000f1', accBAI, 'debit', 1000000);

  -- 01: despesa ANTIGA (3 meses atrás) não desconta do saldo de hoje
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('f0000000-0000-0000-0000-0000000000f2', org, 'MOV-T7-0002', 'expense', current_date - 90, 'Despesa antiga importada', 'file_import', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'f0000000-0000-0000-0000-0000000000f2', accBAI, 'credit', 200000);
  v_bal := current_account_balance(accBAI);
  insert into _tr(name,passed,detail) values('01 despesa antiga nao desconta do saldo de hoje', v_bal = 1000000, 'saldo '||v_bal);

  -- 02: despesa de hoje, posterior à abertura, desconta normalmente
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('f0000000-0000-0000-0000-0000000000f3', org, 'MOV-T7-0003', 'expense', current_date, 'Despesa de hoje', 'manual', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'f0000000-0000-0000-0000-0000000000f3', accBAI, 'credit', 100000);
  v_bal := current_account_balance(accBAI);
  insert into _tr(name,passed,detail) values('02 despesa de hoje desconta', v_bal = 900000, 'saldo '||v_bal);

  -- 03: despesa futura não entra
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('f0000000-0000-0000-0000-0000000000f4', org, 'MOV-T7-0004', 'expense', current_date + 10, 'Despesa futura', 'manual', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'f0000000-0000-0000-0000-0000000000f4', accBAI, 'credit', 300000);
  v_bal := current_account_balance(accBAI);
  insert into _tr(name,passed,detail) values('03 despesa futura nao entra', v_bal = 900000, 'saldo '||v_bal);

  -- 04: conta sem opening_balance soma tudo (fallback seguro)
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('f0000000-0000-0000-0000-0000000000f5', org, 'MOV-T7-0005', 'income', current_date - 200, 'Receita antiga, conta sem abertura', 'manual', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'f0000000-0000-0000-0000-0000000000f5', accSemAbertura, 'debit', 77777);
  v_bal := current_account_balance(accSemAbertura);
  insert into _tr(name,passed,detail) values('04 sem opening_balance soma tudo', v_bal = 77777, 'saldo '||v_bal);

  -- 05: reversão de um movimento posterior à abertura afeta o saldo (cancela-o)
  select reverse_journal_entry('f0000000-0000-0000-0000-0000000000f3'::uuid, 'teste') into v_rev;
  v_bal := current_account_balance(accBAI);
  -- despesa de hoje (100K) revertida -> volta a 1.000.000 (mais a futura, que continua de fora)
  insert into _tr(name,passed,detail) values('05 reversao de movimento recente cancela o efeito', v_bal = 1000000, 'saldo '||v_bal);

  -- 06: reversão de um movimento ANTERIOR à data-base não cria movimento fantasma
  select reverse_journal_entry('f0000000-0000-0000-0000-0000000000f2'::uuid, 'teste') into v_rev;
  v_bal := current_account_balance(accBAI);
  -- a despesa antiga nunca tinha contado (histórico); revertê-la também não deve mexer no saldo.
  insert into _tr(name,passed,detail) values('06 reversao de movimento historico nao cria fantasma', v_bal = 1000000, 'saldo '||v_bal);

  -- 07: fatura de cliente pendente não afeta o saldo de caixa
  v_bal := current_account_balance(accBAI);
  v := create_financial_obligation(org, 'receivable', cli, current_date + 15, 500000, 'invoice_reference');
  v_ob := (v->>'id')::uuid;
  insert into _tr(name,passed,detail) values('07 fatura de cliente pendente nao afeta caixa', current_account_balance(accBAI) = v_bal, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 08: fatura de fornecedor pendente não afeta o saldo de caixa
  v_bal := current_account_balance(accBAI);
  v := create_financial_obligation(org, 'payable', forn, current_date + 15, 200000, 'supplier_invoice');
  insert into _tr(name,passed,detail) values('08 fatura de fornecedor pendente nao afeta caixa', current_account_balance(accBAI) = v_bal, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 09: recebimento da fatura (settlement incoming) só afeta o caixa na data do settlement
  v_bal := current_account_balance(accBAI);
  v := post_settlement(org, 'incoming', cli, accBAI, json_build_array(json_build_object('obligation_id', v_ob, 'amount', 500000))::jsonb, current_date);
  insert into _tr(name,passed,detail) values('09 recebimento aumenta o caixa na data do settlement', current_account_balance(accBAI) = v_bal + 500000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 10: fatura histórica paga ANTES da data-base fica no histórico sem alterar o saldo de hoje
  v_bal := current_account_balance(accBAI);
  v := create_financial_obligation(org, 'payable', forn, current_date - 100, 150000, 'supplier_invoice', null, current_date - 100);
  v_ob := (v->>'id')::uuid;
  v := post_settlement(org, 'outgoing', forn, accBAI, json_build_array(json_build_object('obligation_id', v_ob, 'amount', 150000))::jsonb, current_date - 100);
  -- o pagamento foi datado de há 100 dias — anterior à data-base (abertura de hoje) — não deve alterar o saldo atual
  insert into _tr(name,passed,detail) values('10 pagamento historico anterior a data-base nao altera saldo de hoje', current_account_balance(accBAI) = v_bal, 'antes '||v_bal||' depois '||current_account_balance(accBAI));
  -- mas continua auditável no livro:
  insert into _tr(name,passed,detail) values('10b pagamento historico continua no livro', exists(
    select 1 from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
    where je.organization_id = org and jl.account_id = accBAI and je.transaction_date = current_date - 100 and je.entry_type='expense'
  ), 'ok');

end $$;

select name, passed, detail from _tr order by id;
