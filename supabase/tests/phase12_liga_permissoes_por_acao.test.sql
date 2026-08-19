-- Fase 3: liga RPCs a user_can_do(). Reaproveita a org test-org-req-lock-f
-- (phase10/phase11) e acrescenta um contacto + obrigações para testar
-- post_settlement por papel.

set session_replication_role = replica;
delete from settlement_allocations where organization_id = 'f1000000-0000-0000-0000-000000000001';
delete from settlements where organization_id = 'f1000000-0000-0000-0000-000000000001';
delete from financial_obligations where organization_id = 'f1000000-0000-0000-0000-000000000001';
delete from journal_lines where organization_id = 'f1000000-0000-0000-0000-000000000001';
delete from journal_entries where organization_id = 'f1000000-0000-0000-0000-000000000001' and entry_number like 'MOV-T12-%';
delete from contacts where id in ('f4000000-0000-0000-0000-000000000001');

insert into contacts (id, organization_id, name, kind) values
  ('f4000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Contacto Teste F','ambos');
insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, created_by, idempotency_key) values
  ('f5000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','MOV-T12-0001','opening_balance', current_date, 'Abertura Caixa F', 'seed', 'f2000000-0000-0000-0000-000000000001', gen_random_uuid());
insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values
  ('f1000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','debit', 500000);
set session_replication_role = origin;

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  ownerF uuid := 'f2000000-0000-0000-0000-000000000001';
  reqF uuid := 'f2000000-0000-0000-0000-000000000002';
  reqF2 uuid := 'f2000000-0000-0000-0000-000000000003';
  aprovF uuid := 'f2000000-0000-0000-0000-000000000004';
  caixaF uuid := 'f2000000-0000-0000-0000-000000000006';
  rhF uuid := 'f2000000-0000-0000-0000-000000000007';
  cobradorF uuid := 'f2000000-0000-0000-0000-000000000008';
  pagadorF uuid := 'f2000000-0000-0000-0000-000000000009';
  accF uuid := 'f3000000-0000-0000-0000-000000000001';
  contF uuid := 'f4000000-0000-0000-0000-000000000001';
  v json;
  v_req6 uuid; v_req7 uuid; v_req8 uuid;
  v_ob_rec uuid; v_ob_pay uuid; v_ob_loan uuid;
  v_status text;
begin
  -- T1: requisitante NAO pode mais aprovar requisicao de outro requisitante [fecha gap]
  perform set_config('request.jwt.claims', json_build_object('sub', reqF2, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F6', 'Aprov F', null, null, 4000, current_date, 'Teste T1', 'Material', 'expense', null, null, null, null);
  v_req6 := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  begin
    perform approve_requisition(v_req6, accF, orgF, false);
    insert into _tr(name,passed,detail) values('T1 requisitante NAO aprova requisicao de outro requisitante (fecha gap)', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T1 requisitante NAO aprova requisicao de outro requisitante (fecha gap)', sqlerrm like '%permissão%', sqlerrm);
  end;

  -- T2: aprovador NAO pode mais criar requisicao
  perform set_config('request.jwt.claims', json_build_object('sub', aprovF, 'role','authenticated')::text, true);
  begin
    perform create_requisition(orgF, 'Req Aprov', 'Aprov F', null, null, 1000, current_date, 'Teste T2', 'Material', 'expense', null, null, null, null);
    insert into _tr(name,passed,detail) values('T2 aprovador NAO cria requisicao', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T2 aprovador NAO cria requisicao', sqlerrm like '%permissão%', sqlerrm);
  end;

  -- T3: caixa passa a poder executar disburse_requisition (nova capacidade)
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F7', 'Aprov F', null, null, 6000, current_date, 'Teste T3', 'Material', 'expense', null, null, null, null);
  v_req7 := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', aprovF, 'role','authenticated')::text, true);
  v := approve_requisition(v_req7, accF, orgF, false);

  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  v := disburse_requisition(v_req7, accF, orgF);
  select status::text into v_status from requisitions where id = v_req7;
  insert into _tr(name,passed,detail) values('T3 caixa desembolsa requisicao ja aprovada (nova capacidade)', v_status = 'desembolsada', 'status='||v_status);

  -- T4: caixa NAO pode aprovar+desembolsar de um so passo uma requisicao ainda pendente (confirma o fix)
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F8', 'Aprov F', null, null, 7000, current_date, 'Teste T4', 'Material', 'expense', null, null, null, null);
  v_req8 := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  begin
    perform approve_requisition(v_req8, accF, orgF, true);
    insert into _tr(name,passed,detail) values('T4 caixa NAO aprova+desembolsa pendente num passo so', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T4 caixa NAO aprova+desembolsa pendente num passo so', sqlerrm like '%permissão%', sqlerrm);
  end;

  -- T5: owner continua a aprovar+desembolsar num passo so (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := approve_requisition(v_req8, accF, orgF, true);
  select status::text into v_status from requisitions where id = v_req8;
  insert into _tr(name,passed,detail) values('T5 owner aprova+desembolsa num passo so (regressao)', v_status = 'aprovado', 'status='||v_status);

  -- T6: cobrador continua a poder receber de recebiveis (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := create_financial_obligation(orgF, 'receivable', contF, current_date + 15, 3000, 'other');
  v_ob_rec := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', cobradorF, 'role','authenticated')::text, true);
  v := post_settlement(orgF, 'incoming', contF, accF, jsonb_build_array(jsonb_build_object('obligation_id', v_ob_rec, 'amount', 3000)));
  insert into _tr(name,passed,detail) values('T6 cobrador recebe recebivel via post_settlement (regressao)', (v->>'duplicate') = 'false', v::text);

  -- T7: pagador continua a poder pagar payables (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := create_financial_obligation(orgF, 'payable', contF, current_date + 15, 2000, 'other');
  v_ob_pay := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', pagadorF, 'role','authenticated')::text, true);
  v := post_settlement(orgF, 'outgoing', contF, accF, jsonb_build_array(jsonb_build_object('obligation_id', v_ob_pay, 'amount', 2000)));
  insert into _tr(name,passed,detail) values('T7 pagador paga payable via post_settlement (regressao)', (v->>'duplicate') = 'false', v::text);

  -- T8: rh continua a poder receber devolucao de emprestimo (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := grant_employee_loan(orgF, contF, accF, 5000, 'employee_loan');
  v_ob_loan := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', rhF, 'role','authenticated')::text, true);
  v := post_settlement(orgF, 'incoming', contF, accF, jsonb_build_array(jsonb_build_object('obligation_id', v_ob_loan, 'amount', 5000)));
  insert into _tr(name,passed,detail) values('T8 rh recebe devolucao de emprestimo via post_settlement (regressao)', (v->>'duplicate') = 'false', v::text);

  -- T9: cobrador continua bloqueado de pagar payable (papel errado, regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := create_financial_obligation(orgF, 'payable', contF, current_date + 15, 1000, 'other');
  v_ob_pay := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', cobradorF, 'role','authenticated')::text, true);
  begin
    perform post_settlement(orgF, 'outgoing', contF, accF, jsonb_build_array(jsonb_build_object('obligation_id', v_ob_pay, 'amount', 1000)));
    insert into _tr(name,passed,detail) values('T9 cobrador continua bloqueado de pagar payable (regressao)', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T9 cobrador continua bloqueado de pagar payable (regressao)', sqlerrm like '%permissão%', sqlerrm);
  end;
end $$;

select id, name, passed, detail from _tr order by id;
