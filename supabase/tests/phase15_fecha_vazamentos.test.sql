-- Fase 6: refresh_financial_notifications, report_loans_position,
-- file_attachments. Reaproveita org test-org-req-lock-f.

set session_replication_role = replica;
delete from financial_notifications where organization_id = 'f1000000-0000-0000-0000-000000000001';
delete from file_attachments where organization_id = 'f1000000-0000-0000-0000-000000000001';
set session_replication_role = origin;

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  ownerF uuid := 'f2000000-0000-0000-0000-000000000001';
  reqF uuid := 'f2000000-0000-0000-0000-000000000002';
  caixaF uuid := 'f2000000-0000-0000-0000-000000000006';
  rhF uuid := 'f2000000-0000-0000-0000-000000000007';
  cobradorF uuid := 'f2000000-0000-0000-0000-000000000008';
  contF uuid := 'f4000000-0000-0000-0000-000000000001';
  v json;
  v_ob_overdue uuid;
  v_ob_loan uuid;
  v_att_loan uuid;
  v_att_normal uuid;
  v_cnt int;
begin
  -- Fixtures: uma obrigacao recebivel vencida + um emprestimo aberto
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := create_financial_obligation(orgF, 'receivable', contF, current_date - 5, 4000, 'other');
  v_ob_overdue := (v->>'id')::uuid;
  v := grant_employee_loan(orgF, contF, 'f3000000-0000-0000-0000-000000000001'::uuid, 2000, 'employee_loan');
  v_ob_loan := (v->>'id')::uuid;

  -- T1: caixa (tem ledger, nao tem loans) NAO consegue chamar report_loans_position
  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  begin
    perform report_loans_position(orgF, current_date - 30, current_date + 30);
    insert into _tr(name,passed,detail) values('T1 caixa NAO ve report_loans_position (fecha vazamento)', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T1 caixa NAO ve report_loans_position (fecha vazamento)', sqlerrm like '%permissão%', sqlerrm);
  end;

  -- T2: rh (tem loans) continua a ver o relatorio (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', rhF, 'role','authenticated')::text, true);
  v := report_loans_position(orgF, current_date - 30, current_date + 30);
  insert into _tr(name,passed,detail) values('T2 rh ve report_loans_position (regressao)', v->'totals' is not null, v::text);

  -- T3: requisitante nao tem nenhuma das 3 permissoes -> zero notificacoes criadas
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := refresh_financial_notifications(orgF);
  insert into _tr(name,passed,detail) values('T3 requisitante nao recebe notificacoes financeiras (fecha vazamento)', (v->>'created')::int = 0, v::text);

  -- T4: owner recebe as notificacoes normalmente (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := refresh_financial_notifications(orgF);
  insert into _tr(name,passed,detail) values('T4 owner recebe notificacoes (regressao)', (v->>'created')::int > 0, v::text);

  -- Fixtures de anexos: um ligado a obrigacao normal, um ligado a emprestimo
  insert into file_attachments (id, organization_id, uploaded_by, entity_type, entity_id, file_name, storage_path, mime_type, byte_size)
  values (gen_random_uuid(), orgF, ownerF, 'obligation', v_ob_overdue, 'comprovativo.pdf', orgF::text || '/teste-normal.pdf', 'application/pdf', 1000)
  returning id into v_att_normal;
  insert into file_attachments (id, organization_id, uploaded_by, entity_type, entity_id, file_name, storage_path, mime_type, byte_size)
  values (gen_random_uuid(), orgF, ownerF, 'obligation', v_ob_loan, 'contrato_emprestimo.pdf', orgF::text || '/teste-loan.pdf', 'application/pdf', 1000)
  returning id into v_att_loan;

  -- T5: cobrador NAO ve o anexo do emprestimo (fecha vazamento)
  perform set_config('request.jwt.claims', json_build_object('sub', cobradorF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from file_attachments where id = v_att_loan;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T5 cobrador NAO ve anexo de emprestimo (fecha vazamento)', v_cnt = 0, 'viu '||v_cnt);

  -- T6: cobrador ve o anexo da obrigacao normal (regressao)
  execute 'set local role authenticated';
  select count(*) into v_cnt from file_attachments where id = v_att_normal;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T6 cobrador ve anexo de obrigacao normal (regressao)', v_cnt = 1, 'viu '||v_cnt);

  -- T7: rh ve o anexo do emprestimo, nao ve o da obrigacao normal
  perform set_config('request.jwt.claims', json_build_object('sub', rhF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from file_attachments where id = v_att_loan;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T7 rh ve anexo de emprestimo', v_cnt = 1, 'viu '||v_cnt);

  execute 'set local role authenticated';
  select count(*) into v_cnt from file_attachments where id = v_att_normal;
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T8 rh NAO ve anexo de obrigacao normal (papel errado)', v_cnt = 0, 'viu '||v_cnt);

  -- T9: owner ve os dois (regressao)
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from file_attachments where id in (v_att_loan, v_att_normal);
  execute 'reset role';
  insert into _tr(name,passed,detail) values('T9 owner ve os dois anexos (regressao)', v_cnt = 2, 'viu '||v_cnt);
end $$;

select id, name, passed, detail from _tr order by id;
