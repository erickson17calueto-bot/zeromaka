-- Fase — categorias/subcategorias, documentos nos lançamentos e regras de
-- faturas/transferências/saldo. Mesmo formato das fases anteriores: fixtures
-- isoladas em test-org-d, tabela de resultados _tr.

set session_replication_role = replica;
delete from settlement_allocations where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from settlements where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from financial_obligations where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from import_rows where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from import_batches where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from journal_lines where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from journal_entries where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from financial_categories where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from accounts where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from contacts where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from organization_members where organization_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from organizations where id = 'd0000000-0000-0000-0000-0000000000d1';
delete from auth.users where email like '%@t8.test';
set session_replication_role = origin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('40000000-0000-0000-0000-000000000001','ownerD@t8.test','{}','authenticated','authenticated');
insert into organizations (id, name, slug) values
  ('d0000000-0000-0000-0000-0000000000d1','Test Org D','test-org-d');
insert into organization_members (organization_id, user_id, role) values
  ('d0000000-0000-0000-0000-0000000000d1','40000000-0000-0000-0000-000000000001','owner');
insert into contacts (id, organization_id, name, kind) values
  ('e0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-0000000000d1','Cliente D','cliente'),
  ('e0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-0000000000d1','Fornecedor D','fornecedor');
insert into accounts (id, organization_id, name, type, initial_balance) values
  ('f0000000-0000-0000-0000-0000000000f1','d0000000-0000-0000-0000-0000000000d1','BAI D','bank',1000000),
  ('f0000000-0000-0000-0000-0000000000f2','d0000000-0000-0000-0000-0000000000d1','Caixa D','cash',0);

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  org uuid := 'd0000000-0000-0000-0000-0000000000d1';
  owner uuid := '40000000-0000-0000-0000-000000000001';
  cli uuid := 'e0000000-0000-0000-0000-0000000000e1';
  forn uuid := 'e0000000-0000-0000-0000-0000000000e2';
  accBAI uuid := 'f0000000-0000-0000-0000-0000000000f1';
  accCaixa uuid := 'f0000000-0000-0000-0000-0000000000f2';
  v json; v_bal numeric; v_parent uuid; v_sub1 uuid; v_sub2 uuid; v_income_parent uuid;
  v_ob_recv uuid; v_ob_pay uuid; v_entry uuid; v_batch uuid; v_row uuid; v_count int;
  v_bai_before numeric; v_caixa_before numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);

  -- Abertura de hoje na BAI D, para os testes 13/14 (data-base).
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('a0000000-0000-0000-0000-00000000a001', org, 'MOV-T8-0001', 'opening_balance', current_date, 'Abertura BAI D', 'seed', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'a0000000-0000-0000-0000-00000000a001', accBAI, 'debit', 1000000);

  -- 01: categoria principal com várias subcategorias
  v := create_financial_category(org, 'Transporte Teste', 'expense');
  v_parent := (v->>'id')::uuid;
  v := create_financial_category(org, 'Combustível Teste', 'expense', v_parent);
  v_sub1 := (v->>'id')::uuid;
  v := create_financial_category(org, 'Portagens Teste', 'expense', v_parent);
  v_sub2 := (v->>'id')::uuid;
  select count(*) into v_count from financial_categories where parent_id = v_parent;
  insert into _tr(name,passed,detail) values('01 categoria principal com varias subcategorias', v_count = 2, 'subcategorias '||v_count);

  -- 02: categoria de entrada não pode ser usada numa despesa
  v := create_financial_category(org, 'Vendas Teste', 'income');
  v_income_parent := (v->>'id')::uuid;
  begin
    perform post_expense(org, accBAI, 1000, 'teste categoria errada', current_date, v_income_parent);
    insert into _tr(name,passed,detail) values('02 categoria de entrada rejeitada numa despesa', false, 'nao rejeitou');
  exception when others then
    insert into _tr(name,passed,detail) values('02 categoria de entrada rejeitada numa despesa', true, sqlerrm);
  end;

  -- 02b: subcategoria de tipo diferente da mãe é rejeitada na criação
  begin
    perform create_financial_category(org, 'Sub errada', 'income', v_parent); -- v_parent é expense
    insert into _tr(name,passed,detail) values('02b subcategoria de tipo diferente da mae rejeitada', false, 'nao rejeitou');
  exception when others then
    insert into _tr(name,passed,detail) values('02b subcategoria de tipo diferente da mae rejeitada', true, sqlerrm);
  end;

  -- 03: categoria arquivada não aparece em novos lançamentos (rejeitada por post_expense)
  perform archive_financial_category(v_sub2);
  begin
    perform post_expense(org, accBAI, 1000, 'teste categoria arquivada', current_date, v_sub2);
    insert into _tr(name,passed,detail) values('03 categoria arquivada rejeitada num lancamento novo', false, 'nao rejeitou');
  exception when others then
    insert into _tr(name,passed,detail) values('03 categoria arquivada rejeitada num lancamento novo', true, sqlerrm);
  end;
  -- arquivar a mãe arquiva a subcategoria em cascata
  perform archive_financial_category(v_parent);
  insert into _tr(name,passed,detail) values('03b arquivar a mae arquiva a subcategoria em cascata',
    not (select is_active from financial_categories where id = v_sub1),
    'sub1 ativa? '||(select is_active::text from financial_categories where id = v_sub1));
  perform reactivate_financial_category(v_parent);
  insert into _tr(name,passed,detail) values('03c reativar a mae reativa as subcategorias em cascata',
    (select is_active from financial_categories where id = v_sub1),
    'sub1 ativa? '||(select is_active::text from financial_categories where id = v_sub1));

  -- 04: não existe RPC de apagar categoria, só arquivar — confirmar que
  -- arquivar não quebra a ligação de uma categoria já usada num lançamento.
  v := post_expense(org, accBAI, 50000, 'despesa com categoria', current_date, v_sub1);
  v_entry := (v->>'id')::uuid;
  perform archive_financial_category(v_sub1);
  select count(*) into v_count from journal_entries where id = v_entry and category_id = v_sub1;
  insert into _tr(name,passed,detail) values('04 categoria arquivada continua ligada ao lancamento historico', v_count = 1, 'ligacoes '||v_count);
  perform reactivate_financial_category(v_sub1);

  -- 05: lançamento sem documento é aceite (document_kind='none', sem número)
  v := post_expense(org, accBAI, 25000, 'compra em numerario sem recibo', current_date, v_sub1,
    null, null, null, '{}'::jsonb, 'none'::entry_document_kind, null, null, 'compra de papel e canetas');
  v_entry := (v->>'id')::uuid;
  select count(*) into v_count from journal_entries where id = v_entry and document_kind = 'none' and document_number is null;
  insert into _tr(name,passed,detail) values('05 lancamento sem documento aceite', v_count = 1, 'ok');

  -- 06: lançamento com fatura guarda document_number
  v := post_income(org, accBAI, 80000, 'venda com fatura', current_date, null, cli, null,
    null, '{}'::jsonb, 'invoice'::entry_document_kind, 'FT 2026/001', current_date, null);
  v_entry := (v->>'id')::uuid;
  insert into _tr(name,passed,detail) values('06 lancamento com fatura guarda document_number',
    (select document_number from journal_entries where id = v_entry) = 'FT 2026/001',
    'numero '||(select document_number from journal_entries where id = v_entry));

  -- 07: lançamento com referência bancária guarda reference
  v := post_expense(org, accBAI, 15000, 'pagamento com referencia', current_date, v_sub1, null, 'REF-BANCO-999');
  v_entry := (v->>'id')::uuid;
  insert into _tr(name,passed,detail) values('07 lancamento com referencia bancaria guarda reference',
    (select reference from journal_entries where id = v_entry) = 'REF-BANCO-999',
    'ref '||(select reference from journal_entries where id = v_entry));

  -- 08: fatura pendente não altera caixa
  v_bal := current_account_balance(accBAI);
  v := create_financial_obligation(org, 'receivable', cli, current_date + 10, 300000, 'invoice_reference');
  v_ob_recv := (v->>'id')::uuid;
  insert into _tr(name,passed,detail) values('08 fatura pendente nao altera caixa', current_account_balance(accBAI) = v_bal, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 09: pagamento de fatura (fornecedor) reduz caixa
  v := create_financial_obligation(org, 'payable', forn, current_date + 10, 40000, 'supplier_invoice');
  v_ob_pay := (v->>'id')::uuid;
  v_bal := current_account_balance(accBAI);
  v := post_settlement(org, 'outgoing', forn, accBAI,
    json_build_array(json_build_object('obligation_id', v_ob_pay, 'amount', 40000))::jsonb,
    current_date, null, null, null, null, null, 'bank_proof'::entry_document_kind, 'COMP-001');
  insert into _tr(name,passed,detail) values('09 pagamento de fatura reduz caixa', current_account_balance(accBAI) = v_bal - 40000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));
  insert into _tr(name,passed,detail) values('09b settlement guarda document_kind/document_number',
    exists(select 1 from settlements where id = (v->>'id')::uuid and document_kind = 'bank_proof' and document_number = 'COMP-001'), 'ok');

  -- 10: recebimento de fatura (cliente) aumenta caixa
  v_bal := current_account_balance(accBAI);
  v := post_settlement(org, 'incoming', cli, accBAI,
    json_build_array(json_build_object('obligation_id', v_ob_recv, 'amount', 300000))::jsonb,
    current_date, null, 'REF-RECEBIMENTO-1');
  insert into _tr(name,passed,detail) values('10 recebimento de fatura aumenta caixa', current_account_balance(accBAI) = v_bal + 300000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 11: transferência entre contas não conta como receita nem despesa
  v_bai_before := current_account_balance(accBAI);
  v_caixa_before := current_account_balance(accCaixa);
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('a0000000-0000-0000-0000-00000000a002', org, 'MOV-T8-0002', 'transfer', current_date, 'Transferencia BAI -> Caixa', 'manual', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'a0000000-0000-0000-0000-00000000a002', accBAI, 'credit', 100000),
    (org, 'a0000000-0000-0000-0000-00000000a002', accCaixa, 'debit', 100000);
  insert into _tr(name,passed,detail) values('11 transferencia move saldo entre contas sem duplicar',
    current_account_balance(accBAI) = v_bai_before - 100000 and current_account_balance(accCaixa) = v_caixa_before + 100000,
    'BAI '||current_account_balance(accBAI)||' Caixa '||current_account_balance(accCaixa));
  insert into _tr(name,passed,detail) values('11b transferencia nao tem entry_type income/expense',
    (select entry_type from journal_entries where id = 'a0000000-0000-0000-0000-00000000a002') = 'transfer', 'ok');

  -- 12: importação preserva referência e categoria (apply_import_row)
  insert into import_batches (id, organization_id, source_file_name, source_format, target_type, status, total_rows, created_by)
  values (gen_random_uuid(), org, 'teste.csv', 'csv', 'transaction', 'review', 1, owner)
  returning id into v_batch;
  insert into import_rows (id, organization_id, batch_id, row_number, raw_data, normalized_data, validation_status, decision)
  values (gen_random_uuid(), org, v_batch, 1, '{}'::jsonb,
    jsonb_build_object('date', current_date, 'amount', 12345, 'description', 'linha importada com referencia',
      'direction', 'expense', 'account_id', accBAI, 'category_id', v_sub1, 'reference', 'REF-IMPORT-42'),
    'ready', 'keep')
  returning id into v_row;
  v := apply_import_row(v_row);
  v_entry := (v->>'id')::uuid;
  insert into _tr(name,passed,detail) values('12 importacao preserva referencia e categoria',
    (select reference from journal_entries where id = v_entry) = 'REF-IMPORT-42'
      and (select category_id from journal_entries where id = v_entry) = v_sub1,
    'ref '||(select reference from journal_entries where id = v_entry)||' cat '||(select category_id from journal_entries where id = v_entry));

  -- 13: histórico anterior à data-base não altera o saldo atual
  v_bal := current_account_balance(accBAI);
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('a0000000-0000-0000-0000-00000000a003', org, 'MOV-T8-0003', 'expense', current_date - 60, 'despesa historica importada', 'file_import', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'a0000000-0000-0000-0000-00000000a003', accBAI, 'credit', 77777);
  insert into _tr(name,passed,detail) values('13 historico anterior a data-base nao altera saldo atual', current_account_balance(accBAI) = v_bal, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 14: movimento posterior à data-base altera o saldo atual
  v_bal := current_account_balance(accBAI);
  v := post_expense(org, accBAI, 5000, 'despesa de hoje', current_date, v_sub1);
  insert into _tr(name,passed,detail) values('14 movimento posterior a data-base altera saldo atual', current_account_balance(accBAI) = v_bal - 5000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));
end $$;

select name, passed, detail from _tr order by id;
