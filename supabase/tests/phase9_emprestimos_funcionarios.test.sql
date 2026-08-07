-- Empréstimos e adiantamentos a funcionários. Fixtures isoladas em
-- test-org-e, mesmo formato das fases anteriores.

set session_replication_role = replica;
delete from settlement_allocations where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from settlements where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from financial_obligations where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from journal_lines where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from journal_entries where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from financial_categories where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from accounts where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from contacts where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from organization_members where organization_id = 'e0000000-0000-0000-0000-0000000000e9';
delete from organizations where id = 'e0000000-0000-0000-0000-0000000000e9';
delete from public.profiles where id = '50000000-0000-0000-0000-000000000001';
delete from auth.users where email like '%@t9.test';
set session_replication_role = origin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('50000000-0000-0000-0000-000000000001','ownerE@t9.test','{}','authenticated','authenticated');
insert into organizations (id, name, slug) values
  ('e0000000-0000-0000-0000-0000000000e9','Test Org E','test-org-e');
insert into organization_members (organization_id, user_id, role) values
  ('e0000000-0000-0000-0000-0000000000e9','50000000-0000-0000-0000-000000000001','owner');
insert into contacts (id, organization_id, name, kind) values
  ('c0000000-0000-0000-0000-0000000000c9','e0000000-0000-0000-0000-0000000000e9','Funcionário Teste','funcionario'),
  ('c0000000-0000-0000-0000-0000000000c8','e0000000-0000-0000-0000-0000000000e9','Fornecedor Teste','fornecedor');
insert into accounts (id, organization_id, name, type, initial_balance) values
  ('b0000000-0000-0000-0000-0000000000b9','e0000000-0000-0000-0000-0000000000e9','BAI E','bank',1000000);

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  org uuid := 'e0000000-0000-0000-0000-0000000000e9';
  owner uuid := '50000000-0000-0000-0000-000000000001';
  func uuid := 'c0000000-0000-0000-0000-0000000000c9';
  forn uuid := 'c0000000-0000-0000-0000-0000000000c8';
  accBAI uuid := 'b0000000-0000-0000-0000-0000000000b9';
  v json; v_bal numeric; v_ob_id uuid; v_entry_id uuid; v_cat uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);

  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
    ('a0000000-0000-0000-0000-00000000a901', org, 'MOV-T9-0001', 'opening_balance', current_date, 'Abertura BAI E', 'seed', owner, gen_random_uuid());
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
    (org, 'a0000000-0000-0000-0000-00000000a901', accBAI, 'debit', 1000000);

  v := create_financial_category(org, 'Pessoal', 'expense');
  v_cat := (v->>'id')::uuid;

  -- 01: só funcionário (ou ambos) pode receber — fornecedor é rejeitado
  begin
    perform grant_employee_loan(org, forn, accBAI, 50000, 'employee_loan');
    insert into _tr(name,passed,detail) values('01 fornecedor rejeitado como beneficiario', false, 'nao rejeitou');
  exception when others then
    insert into _tr(name,passed,detail) values('01 fornecedor rejeitado como beneficiario', true, sqlerrm);
  end;

  -- 02: não é possível criar employee_loan via create_financial_obligation direto
  begin
    perform create_financial_obligation(org, 'receivable', func, current_date + 30, 50000, 'employee_loan');
    insert into _tr(name,passed,detail) values('02 employee_loan bloqueado fora de grant_employee_loan', false, 'nao rejeitou');
  exception when others then
    insert into _tr(name,passed,detail) values('02 employee_loan bloqueado fora de grant_employee_loan', true, sqlerrm);
  end;

  -- 03: conceder desconta o caixa na hora (nao espera settlement)
  v_bal := current_account_balance(accBAI);
  v := grant_employee_loan(org, func, accBAI, 150000, 'employee_loan', current_date, current_date + 60, null, v_cat, 'EMP-DOC-1', 'nota interna');
  v_ob_id := (v->>'id')::uuid;
  v_entry_id := (v->>'entry_id')::uuid;
  insert into _tr(name,passed,detail) values('03 conceder desconta o caixa na hora', current_account_balance(accBAI) = v_bal - 150000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 04: obrigação criada, aberta, is_sale falso, ligada ao lançamento de desembolso
  insert into _tr(name,passed,detail) values('04 obrigacao criada com disbursement_entry_id e is_sale=false',
    exists(select 1 from obligation_status where id = v_ob_id and is_sale = false and disbursement_entry_id = v_entry_id and outstanding_amount = 150000),
    'ok');

  -- 05: devolução (settlement incoming) aumenta o caixa
  v_bal := current_account_balance(accBAI);
  v := post_settlement(org, 'incoming', func, accBAI, json_build_array(json_build_object('obligation_id', v_ob_id, 'amount', 60000))::jsonb, current_date, null, 'REF-DEVOLUCAO-1');
  insert into _tr(name,passed,detail) values('05 devolucao aumenta o caixa', current_account_balance(accBAI) = v_bal + 60000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));

  -- 06: outstanding desceu corretamente após devolução parcial
  insert into _tr(name,passed,detail) values('06 outstanding desce apos devolucao parcial',
    (select outstanding_amount from obligation_status where id = v_ob_id) = 90000,
    'pendente '||(select outstanding_amount from obligation_status where id = v_ob_id));

  -- 07: adiantamento salarial segue a mesma mecânica
  v_bal := current_account_balance(accBAI);
  v := grant_employee_loan(org, func, accBAI, 30000, 'salary_advance');
  insert into _tr(name,passed,detail) values('07 adiantamento salarial tambem desconta o caixa na hora', current_account_balance(accBAI) = v_bal - 30000, 'antes '||v_bal||' depois '||current_account_balance(accBAI));
end $$;

select name, passed, detail from _tr order by id;
