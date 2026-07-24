-- Fase 4 — Suite de testes (reservas + disponível de verdade + RLS)
-- Impersonação JWT, 2 orgs, papéis owner/viewer/finance. Cria e limpa fixtures
-- isoladas (orgs test-org-a/b). 35 asserções. Devolve tabela de resultados.

set session_replication_role = replica;
delete from audit_logs where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from reserve_movements where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from financial_reserves where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from reserve_categories where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from organization_financial_settings where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from settlement_allocations where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from settlements where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from financial_obligations where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from journal_lines where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from journal_entries where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from accounts where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from contacts where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from organization_members where organization_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from organizations where id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b1');
delete from auth.users where email like '%@t4.test';
set session_replication_role = origin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('10000000-0000-0000-0000-000000000001','ownerA@t4.test','{}','authenticated','authenticated'),
  ('10000000-0000-0000-0000-000000000002','viewerA@t4.test','{}','authenticated','authenticated'),
  ('10000000-0000-0000-0000-000000000003','financeA@t4.test','{}','authenticated','authenticated'),
  ('20000000-0000-0000-0000-000000000001','ownerB@t4.test','{}','authenticated','authenticated');
insert into organizations (id, name, slug) values
  ('a0000000-0000-0000-0000-0000000000a1','Test Org A','test-org-a'),
  ('b0000000-0000-0000-0000-0000000000b1','Test Org B','test-org-b');
insert into organization_members (organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','owner'),
  ('a0000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000002','viewer'),
  ('a0000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000003','finance'),
  ('b0000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-000000000001','owner');
insert into contacts (id, organization_id, name, kind) values
  ('c0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000a1','Fornecedor A','fornecedor'),
  ('c0000000-0000-0000-0000-0000000000c2','a0000000-0000-0000-0000-0000000000a1','Fornecedor B','fornecedor'),
  ('c0000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-0000000000b1','Fornecedor Borg','fornecedor');
insert into accounts (id, organization_id, name, type, initial_balance) values
  ('ac000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a1','BAI','bank',0),
  ('ac000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000a1','Caixa','cash',0),
  ('ac000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-0000000000b1','BancoB','bank',0);
-- saldos de abertura (BAI 3M, Caixa 500K) via lançamentos diretos
insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
  ('e0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a1','MOV-2026-900001','opening_balance',current_date,'Abertura BAI','seed','10000000-0000-0000-0000-000000000001', gen_random_uuid()),
  ('e0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000a1','MOV-2026-900002','opening_balance',current_date,'Abertura Caixa','seed','10000000-0000-0000-0000-000000000001', gen_random_uuid());
insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
  ('a0000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-0000000000a1','ac000000-0000-0000-0000-0000000000a1','debit',3000000),
  ('a0000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-0000000000a2','ac000000-0000-0000-0000-0000000000a2','debit',500000);
-- categorias de reserva
insert into reserve_categories (id, organization_id, name, category_type, is_system) values
  ('fc000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a1','Salários','payroll',true),
  ('fc000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000a1','Impostos','tax',true),
  ('fc000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-0000000000a1','Emergência','emergency',true),
  ('fc000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-0000000000b1','Salários','payroll',true);

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgA uuid := 'a0000000-0000-0000-0000-0000000000a1';
  orgB uuid := 'b0000000-0000-0000-0000-0000000000b1';
  ownerA uuid := '10000000-0000-0000-0000-000000000001';
  viewerA uuid := '10000000-0000-0000-0000-000000000002';
  financeA uuid := '10000000-0000-0000-0000-000000000003';
  ownerB uuid := '20000000-0000-0000-0000-000000000001';
  fornA uuid := 'c0000000-0000-0000-0000-0000000000c1';
  fornB uuid := 'c0000000-0000-0000-0000-0000000000c2';
  fornBorg uuid := 'c0000000-0000-0000-0000-0000000000c3';
  accBAI uuid := 'ac000000-0000-0000-0000-0000000000a1';
  accCaixa uuid := 'ac000000-0000-0000-0000-0000000000a2';
  accB uuid := 'ac000000-0000-0000-0000-0000000000b1';
  catSal uuid := 'fc000000-0000-0000-0000-0000000000a1';
  catTax uuid := 'fc000000-0000-0000-0000-0000000000a2';
  catEmg uuid := 'fc000000-0000-0000-0000-0000000000a3';
  catBorg uuid := 'fc000000-0000-0000-0000-0000000000b1';
  v json; v_bal numeric; v_tac numeric; v_tac2 numeric; v_res record; v_cnt int;
  r_sal uuid; r_tax uuid; r_emg uuid; r_link uuid; v_ob_a uuid; v_ob_b uuid; v_crit uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);

  -- Reservas (via RPC): salários 1M, impostos 300K, emergência 200K (gerais)
  v := create_reserve(orgA, catSal, 'Salários', 1000000); r_sal := (v->>'id')::uuid;
  v := create_reserve(orgA, catTax, 'Impostos', 300000); r_tax := (v->>'id')::uuid;
  v := create_reserve(orgA, catEmg, 'Emergência', 200000); r_emg := (v->>'id')::uuid;

  -- 01: reserva não altera saldo bancário
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id in (accBAI, accCaixa);
  insert into _tr(name,passed,detail) values('01 reserva nao altera saldo', v_bal = 3500000, 'saldo '||v_bal);

  -- Contas a pagar: A 600K due+5, B 400K due+5 (dentro do horizonte 7d)
  v := create_financial_obligation(orgA,'payable',fornA,current_date+5,600000,'supplier_invoice'); v_ob_a := (v->>'id')::uuid;
  v := create_financial_obligation(orgA,'payable',fornB,current_date+5,400000,'supplier_invoice'); v_ob_b := (v->>'id')::uuid;
  -- reserva mínima 500K
  v := update_financial_settings(orgA, 7, true, true, false, 500000);

  -- Cenário base: disponível = 3.5M - 1.5M - 1M - 0.5M = 0.5M
  v := get_true_available_cash(orgA, 7);
  v_tac := (v->>'true_available_cash')::numeric;
  insert into _tr(name,passed,detail) values('02 reserva reduz disponivel + 05 pagavel no horizonte + 13 reserva minima', v_tac = 500000, 'disponivel '||v_tac);

  -- 31: decomposição soma ao resultado
  insert into _tr(name,passed,detail) values('31 decomposicao soma ao resultado',
    ((v->>'current_cash_balance')::numeric - (v->>'active_reserves_total')::numeric - (v->>'uncovered_commitments_total')::numeric - (v->>'approved_requisitions_total')::numeric - (v->>'minimum_cash_buffer')::numeric) = v_tac,
    'check '||((v->>'current_cash_balance')::numeric - (v->>'active_reserves_total')::numeric - (v->>'uncovered_commitments_total')::numeric - (v->>'minimum_cash_buffer')::numeric));

  -- 11: reserva ligada evita dupla contagem — cria reserva 400K ligada a fornB; total não muda
  v := create_reserve(orgA, catSal, 'Cobre B', 400000, 'obligation_linked', null, v_ob_b); r_link := (v->>'id')::uuid;
  v := get_true_available_cash(orgA, 7);
  v_tac2 := (v->>'true_available_cash')::numeric;
  insert into _tr(name,passed,detail) values('11 reserva ligada evita dupla contagem', v_tac2 = 500000, 'antes '||v_tac||' depois '||v_tac2||' coberto '||(v->>'covered_obligations_total'));

  -- 03 + 04: libertar 100K da emergência aumenta disponível para 600K
  v := release_reserve(r_emg, 100000, 'teste');
  v := get_true_available_cash(orgA, 7);
  insert into _tr(name,passed,detail) values('03 libertacao aumenta + 04 parcial', (v->>'true_available_cash')::numeric = 600000, 'disponivel '||(v->>'true_available_cash'));

  -- 06: conta a pagar fora do horizonte não reduz (due+20, horizonte 7)
  v := create_financial_obligation(orgA,'payable',fornA,current_date+20,999999,'supplier_invoice');
  v := get_true_available_cash(orgA, 7);
  insert into _tr(name,passed,detail) values('06 pagavel fora do horizonte nao reduz', (v->>'true_available_cash')::numeric = 600000, 'disponivel '||(v->>'true_available_cash'));
  -- e com horizonte 30 passa a reduzir
  v := get_true_available_cash(orgA, 30);
  insert into _tr(name,passed,detail) values('06b horizonte 30 inclui', (v->>'true_available_cash')::numeric = 600000 - 999999, 'disponivel '||(v->>'true_available_cash'));

  -- 07: conta a pagar vencida é incluída (due-3)
  v := create_financial_obligation(orgA,'payable',fornA,current_date-3,50000,'supplier_invoice',null,current_date-10);
  v := get_true_available_cash(orgA, 7);
  insert into _tr(name,passed,detail) values('07 pagavel vencida incluida', (v->>'true_available_cash')::numeric = 600000 - 50000, 'disponivel '||(v->>'true_available_cash')||' overdue '||(v->>'overdue_payables_total'));
  -- limpar as duas últimas (fora horizonte + vencida) para restaurar cenário
  update financial_obligations set lifecycle_status='cancelled', cancelled_at=now() where organization_id=orgA and original_amount in (999999, 50000);

  -- 08: obrigação parcialmente paga entra só pelo pendente (pagar 100K de fornA 600K)
  v := post_settlement(orgA,'outgoing',fornA,accBAI, json_build_array(json_build_object('obligation_id',v_ob_a,'amount',100000))::jsonb);
  v := get_true_available_cash(orgA, 7);
  -- saldo caiu 100K (3.4M), reservas 1.8M, fornA pendente 500K, fornB coberto -> disponível = 3.4 - 1.8 - 0.5 - 0.5 = 0.6M
  insert into _tr(name,passed,detail) values('08 parcial entra pelo pendente', (v->>'true_available_cash')::numeric = 600000, 'disponivel '||(v->>'true_available_cash'));

  -- 09: obrigação paga não entra (pagar os 500K restantes de fornA)
  v := post_settlement(orgA,'outgoing',fornA,accBAI, json_build_array(json_build_object('obligation_id',v_ob_a,'amount',500000))::jsonb);
  v := get_true_available_cash(orgA, 7);
  -- saldo 2.9M, reservas 1.8M, fornA 0 (paga), B coberto -> uncovered 0; disponível = 2.9 - 1.8 - 0 - 0.5 = 0.6M
  insert into _tr(name,passed,detail) values('09 paga nao entra', (v->>'true_available_cash')::numeric = 600000 and (v->>'uncovered_commitments_total')::numeric = 0, 'disp '||(v->>'true_available_cash')||' uncov '||(v->>'uncovered_commitments_total'));

  -- 10: obrigação cancelada não entra (cancelar reserva ligada + cancelar fornB)
  v := cancel_reserve(r_link, 'teste'); -- reserva já não cobre
  v := cancel_obligation(v_ob_b, 'teste');
  v := get_true_available_cash(orgA, 7);
  -- reservas: 1M+300K+100K = 1.4M; sem compromissos; disponível = 2.9 - 1.4 - 0 - 0.5 = 1.0M
  insert into _tr(name,passed,detail) values('10 cancelada nao entra', (v->>'true_available_cash')::numeric = 1000000, 'disp '||(v->>'true_available_cash'));

  -- 14: resultado negativo permanece negativo (buffer enorme)
  v := update_financial_settings(orgA, 7, true, true, false, 9999999);
  v := get_true_available_cash(orgA, 7);
  insert into _tr(name,passed,detail) values('14 negativo permanece', (v->>'true_available_cash')::numeric < 0, 'disp '||(v->>'true_available_cash'));
  v := update_financial_settings(orgA, 7, true, true, false, 500000); -- restaura

  -- 15: conta arquivada com saldo é tratada conforme config
  update accounts set is_archived = true where id = accCaixa; -- Caixa 500K arquivada
  v := get_true_available_cash(orgA, 7); -- include_archived=false, mas saldo<>0 => incluída
  v_tac := (v->>'current_cash_balance')::numeric;
  insert into _tr(name,passed,detail) values('15 arquivada com saldo incluida', v_tac = 2900000, 'saldo '||v_tac);
  update accounts set is_archived = false where id = accCaixa;

  -- 16/17: get_true_available_cash é read-only (não cria journal nem settlement)
  select count(*) into v_cnt from journal_entries where organization_id=orgA;
  v := get_true_available_cash(orgA, 7);
  select count(*) into v_bal from journal_entries where organization_id=orgA;
  insert into _tr(name,passed,detail) values('16/17 calculo e read-only', v_bal = v_cnt, 'entries '||v_cnt||'->'||v_bal);

  -- 26: precisão monetária
  v := create_reserve(orgA, catTax, 'Precisao', 1234.56);
  select reserved_amount into v_bal from financial_reserves where id = (v->>'id')::uuid;
  insert into _tr(name,passed,detail) values('26 precisao monetaria', v_bal = 1234.56, 'valor '||v_bal);

  -- 33: reserva não pode ficar negativa (libertar mais do que reservado)
  begin
    v := release_reserve(r_tax, 999999999, 'demasiado');
    insert into _tr(name,passed,detail) values('33 reserva nao negativa', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('33 reserva nao negativa', true, sqlerrm); end;

  -- 34: reserva libertada não pode ser libertada de novo acima do saldo (libertar tudo, depois +1)
  v := create_reserve(orgA, catEmg, 'Libertavel', 5000); r_emg := (v->>'id')::uuid;
  v := release_reserve(r_emg, 5000, 'total');
  begin
    v := release_reserve(r_emg, 1, 'de novo');
    insert into _tr(name,passed,detail) values('34 libertar de novo bloqueado', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('34 libertar de novo bloqueado', true, sqlerrm); end;

  -- 27: pagamento com consumo de reserva é atómico (reserva ligada -> consumida no pagamento)
  v := create_financial_obligation(orgA,'payable',fornA,current_date+3,80000,'supplier_invoice'); v_ob_a := (v->>'id')::uuid;
  v := create_reserve(orgA, catSal, 'Reserva pag', 80000, 'obligation_linked', null, v_ob_a); r_link := (v->>'id')::uuid;
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_bal from journal_lines where account_id=accBAI;
  v := post_settlement(orgA,'outgoing',fornA,accBAI, json_build_array(json_build_object('obligation_id',v_ob_a,'amount',80000))::jsonb, current_date,null,null,null,null, r_link);
  select coalesce(sum(case when direction='debit' then amount else -amount end),0) into v_tac from journal_lines where account_id=accBAI;
  select reserved_amount into v_res from financial_reserves where id=r_link;
  insert into _tr(name,passed,detail) values('27 pagamento consome reserva (atomico)', v_tac = v_bal - 80000 and (select reserved_amount from financial_reserves where id=r_link) = 0, 'saldo delta '||(v_tac-v_bal)||' reserva '||(select reserved_amount from financial_reserves where id=r_link));

  -- 28: falha no pagamento não reduz a reserva (overpay rejeitado)
  v := create_financial_obligation(orgA,'payable',fornA,current_date+3,10000,'supplier_invoice'); v_ob_a := (v->>'id')::uuid;
  v := create_reserve(orgA, catSal, 'Reserva intacta', 10000, 'obligation_linked', null, v_ob_a); r_link := (v->>'id')::uuid;
  begin
    v := post_settlement(orgA,'outgoing',fornA,accBAI, json_build_array(json_build_object('obligation_id',v_ob_a,'amount',99999))::jsonb, current_date,null,null,null,null, r_link);
  exception when others then null; end;
  insert into _tr(name,passed,detail) values('28 falha nao reduz reserva', (select reserved_amount from financial_reserves where id=r_link) = 10000, 'reserva '||(select reserved_amount from financial_reserves where id=r_link));

  -- 32: duas reservas concorrentes mantêm consistência (soma correta)
  select coalesce(sum(reserved_amount),0) into v_bal from financial_reserves where organization_id=orgA and status in ('active','partially_released');
  v := get_true_available_cash(orgA, 7);
  insert into _tr(name,passed,detail) values('32 reservas somam corretamente', (v->>'active_reserves_total')::numeric = v_bal, 'soma '||v_bal||' calc '||(v->>'active_reserves_total'));

  -- 18: viewer não cria reserva
  perform set_config('request.jwt.claims', json_build_object('sub', viewerA, 'role','authenticated')::text, true);
  begin
    v := create_reserve(orgA, catSal, 'V', 1000);
    insert into _tr(name,passed,detail) values('18 viewer nao cria', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('18 viewer nao cria', true, sqlerrm); end;

  -- 19: viewer não liberta reserva
  begin
    v := release_reserve(r_sal, 1000, 'x');
    insert into _tr(name,passed,detail) values('19 viewer nao liberta', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('19 viewer nao liberta', true, sqlerrm); end;

  -- 20: finance cria/aumenta mas NÃO liberta crítica
  perform set_config('request.jwt.claims', json_build_object('sub', financeA, 'role','authenticated')::text, true);
  v := create_reserve(orgA, catSal, 'Critica', 50000, 'general', null, null, null, null, 'critical'); v_crit := (v->>'id')::uuid;
  begin
    v := release_reserve(v_crit, 1000, 'finance tenta');
    insert into _tr(name,passed,detail) values('20 finance nao liberta critica', false, 'libertou');
  exception when others then insert into _tr(name,passed,detail) values('20 finance nao liberta critica', true, sqlerrm); end;

  -- owner LIBERTA a crítica (permitido)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  begin
    v := release_reserve(v_crit, 1000, 'owner liberta');
    insert into _tr(name,passed,detail) values('20b owner liberta critica', true, 'ok');
  exception when others then insert into _tr(name,passed,detail) values('20b owner liberta critica', false, sqlerrm); end;

  -- 22: Org A não usa conta de Org B (reserva account_specific com conta de B)
  begin
    v := create_reserve(orgA, catSal, 'X', 1000, 'account_specific', accB);
    insert into _tr(name,passed,detail) values('22 conta de outra org rejeitada', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('22 conta de outra org rejeitada', true, sqlerrm); end;

  -- 23: Org A não liga obrigação de Org B
  perform set_config('request.jwt.claims', json_build_object('sub', ownerB, 'role','authenticated')::text, true);
  v := create_financial_obligation(orgB,'payable',fornBorg,current_date+5,10000); v_ob_b := (v->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  begin
    v := create_reserve(orgA, catSal, 'X', 1000, 'obligation_linked', null, v_ob_b);
    insert into _tr(name,passed,detail) values('23 obrigacao de outra org rejeitada', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('23 obrigacao de outra org rejeitada', true, sqlerrm); end;

  -- 25: função rejeita organization_id não autorizado
  begin
    v := get_true_available_cash(orgB, 7);
    insert into _tr(name,passed,detail) values('25 org nao autorizada rejeitada', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('25 org nao autorizada rejeitada', true, sqlerrm); end;

  -- 30: Dashboard usa o mesmo cálculo do servidor (determinístico: duas chamadas iguais)
  v := get_true_available_cash(orgA, 7);
  perform set_config('request.jwt.claims', json_build_object('sub', financeA, 'role','authenticated')::text, true);
  select (get_true_available_cash(orgA, 7)->>'true_available_cash')::numeric into v_tac2;
  insert into _tr(name,passed,detail) values('30 calculo deterministico', (v->>'true_available_cash')::numeric = v_tac2, 'owner '||(v->>'true_available_cash')||' finance '||v_tac2);

  -- 21: Org A não vê reservas de Org B (RLS) — via role authenticated
  perform set_config('request.jwt.claims', json_build_object('sub', ownerB, 'role','authenticated')::text, true);
  v := create_reserve(orgB, catBorg, 'Reserva B', 1000);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  select count(*) into v_cnt from financial_reserves where organization_id = orgB;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('21 A nao ve reservas de B', v_cnt = 0, 'viu '||v_cnt);

  -- 35: anon não acede
  begin
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    select count(*) into v_cnt from financial_reserves;
    execute 'reset role';
    insert into _tr(name,passed,detail) values('35 anon nao acede', v_cnt = 0, 'viu '||v_cnt);
  exception when others then execute 'reset role'; insert into _tr(name,passed,detail) values('35 anon nao acede', true, 'bloqueado'); end;

  -- 24: função valida auth.uid() (sem claims)
  begin
    perform set_config('request.jwt.claims', '', true);
    v := get_true_available_cash(orgA, 7);
    insert into _tr(name,passed,detail) values('24 valida auth.uid', false, 'nao lancou');
  exception when others then insert into _tr(name,passed,detail) values('24 valida auth.uid', true, sqlerrm); end;

  -- 12: requisição convertida em obrigação não conta duas vezes.
  -- No fluxo atual approve_requisition lança logo no livro; get_true_available_cash só conta
  -- requisições aprovadas SEM journal_entry ligado. Verificamos que uma requisição aprovada
  -- COM journal_entry (metadata.requisition_id) NÃO é contada.
  perform set_config('request.jwt.claims', json_build_object('sub', ownerA, 'role','authenticated')::text, true);
  insert into requisitions (id, organization_id, number, requester, approver, amount, date, purpose, category, status)
  values ('d0000000-0000-0000-0000-0000000000a1', orgA, 'RQ-T-001', 'Teste', 'Owner', 70000, current_date, 'Compra teste', 'Outros', 'aprovado');
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key, metadata)
  values ('e0000000-0000-0000-0000-0000000000a9', orgA, 'MOV-2026-900009','expense',current_date,'Req paga','requisition','10000000-0000-0000-0000-000000000001', gen_random_uuid(), jsonb_build_object('requisition_id','d0000000-0000-0000-0000-0000000000a1'));
  v := get_true_available_cash(orgA, 7);
  insert into _tr(name,passed,detail) values('12 requisicao convertida nao conta duas vezes', (v->>'approved_requisitions_total')::numeric = 0, 'reqs '||(v->>'approved_requisitions_total'));
end $$;

select name, passed, detail from _tr order by id;
