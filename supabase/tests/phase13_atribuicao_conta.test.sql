-- Fase 4: account_assignments. Reaproveita org test-org-req-lock-f.

set session_replication_role = replica;
delete from account_assignments where organization_id = 'f1000000-0000-0000-0000-000000000001';
set session_replication_role = origin;

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  ownerF uuid := 'f2000000-0000-0000-0000-000000000001';
  reqF uuid := 'f2000000-0000-0000-0000-000000000002';
  aprovF uuid := 'f2000000-0000-0000-0000-000000000004';
  caixaF uuid := 'f2000000-0000-0000-0000-000000000006';
  rhF uuid := 'f2000000-0000-0000-0000-000000000007';
  accF uuid := 'f3000000-0000-0000-0000-000000000001';
  contF uuid := 'f4000000-0000-0000-0000-000000000001';
  v json;
  v_req uuid;
  v_status text;
  v_cnt int;
begin
  -- T1: sem atribuicao nenhuma, caixa NAO desembolsa (falha fechada)
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F9', 'Aprov F', null, null, 9000, current_date, 'Teste Fase4 T1', 'Material', 'expense', null, null, null, null);
  v_req := (v->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', aprovF, 'role','authenticated')::text, true);
  perform approve_requisition(v_req, accF, orgF, false);

  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  begin
    perform disburse_requisition(v_req, accF, orgF);
    insert into _tr(name,passed,detail) values('T1 caixa sem atribuicao NAO desembolsa (falha fechada)', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T1 caixa sem atribuicao NAO desembolsa (falha fechada)', sqlerrm like '%atribuída%', sqlerrm);
  end;

  -- T4: nao-admin nao consegue atribuir conta
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  begin
    perform assign_account(orgF, caixaF, accF);
    insert into _tr(name,passed,detail) values('T4 nao-admin NAO atribui conta', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T4 nao-admin NAO atribui conta', sqlerrm like '%permissão%', sqlerrm);
  end;

  -- T2: owner atribui a conta a caixa
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := assign_account(orgF, caixaF, accF);
  select count(*) into v_cnt from account_assignments where organization_id = orgF and user_id = caixaF and account_id = accF;
  insert into _tr(name,passed,detail) values('T2 owner atribui conta a caixa', v_cnt = 1, 'linhas='||v_cnt);

  -- T3: agora caixa desembolsa com sucesso
  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  v := disburse_requisition(v_req, accF, orgF);
  select status::text into v_status from requisitions where id = v_req;
  insert into _tr(name,passed,detail) values('T3 caixa desembolsa apos atribuicao', v_status = 'desembolsada', 'status='||v_status);

  -- T5: atribuir a utilizador que nao e membro falha
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  begin
    perform assign_account(orgF, '00000000-0000-0000-0000-000000000099'::uuid, accF);
    insert into _tr(name,passed,detail) values('T5 atribuir a nao-membro falha', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T5 atribuir a nao-membro falha', sqlerrm like '%membro%', sqlerrm);
  end;

  -- T6: rh continua sem restricao de conta nenhuma (regressao — caminho antigo user_can_write)
  perform set_config('request.jwt.claims', json_build_object('sub', rhF, 'role','authenticated')::text, true);
  v := grant_employee_loan(orgF, contF, accF, 1500, 'employee_loan');
  insert into _tr(name,passed,detail) values('T6 rh continua sem restricao de conta (regressao)', (v->>'entry_id') is not null, v::text);

  -- T7: caixa via loans.disburse tambem precisa de atribuicao (mesma conta ja atribuida em T2, deve funcionar)
  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  v := grant_employee_loan(orgF, contF, accF, 1200, 'employee_loan');
  insert into _tr(name,passed,detail) values('T7 caixa com conta atribuida concede emprestimo', (v->>'entry_id') is not null, v::text);

  -- T8: revogar a atribuicao volta a bloquear caixa
  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := unassign_account(orgF, caixaF, accF);

  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  begin
    perform grant_employee_loan(orgF, contF, accF, 900, 'employee_loan');
    insert into _tr(name,passed,detail) values('T8 revogar atribuicao volta a bloquear caixa', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T8 revogar atribuicao volta a bloquear caixa', sqlerrm like '%atribuída%', sqlerrm);
  end;
end $$;

select id, name, passed, detail from _tr order by id;
