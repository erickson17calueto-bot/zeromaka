-- Fecho de `requisitions` a escrita exclusiva por RPC (20260819_0072).
-- Cobre os 3 achados [Crítico] da auditoria de 2026-08-19: autoaprovação,
-- duplo desembolso via UPDATE direto, e apagar requisições já decididas.
-- Também cobre a nova reject_requisition e isolamento entre organizações.
-- Fixtures isoladas em test-org-req-lock-f/g — não colide com phase1-9.

set session_replication_role = replica;
delete from requisitions where organization_id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
delete from journal_lines where organization_id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
delete from journal_entries where organization_id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
delete from accounts where organization_id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
delete from organization_members where organization_id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
delete from organizations where id in ('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002');
delete from public.profiles where id in ('f2000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000005');
delete from auth.users where email like '%@treqlock.test';
set session_replication_role = origin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('f2000000-0000-0000-0000-000000000001','ownerF@treqlock.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000002','reqF@treqlock.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000003','reqF2@treqlock.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000004','aprovF@treqlock.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000005','ownerG@treqlock.test','{}','authenticated','authenticated');

insert into organizations (id, name, slug) values
  ('f1000000-0000-0000-0000-000000000001','Test Org Req Lock F','test-org-req-lock-f'),
  ('f1000000-0000-0000-0000-000000000002','Test Org Req Lock G','test-org-req-lock-g');

insert into organization_members (organization_id, user_id, role) values
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','owner'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','requisitante'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000003','requisitante'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000004','aprovador'),
  ('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000005','owner');

insert into accounts (id, organization_id, name, type, initial_balance) values
  ('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Caixa F','cash',0);

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  orgG uuid := 'f1000000-0000-0000-0000-000000000002';
  ownerF uuid := 'f2000000-0000-0000-0000-000000000001';
  reqF uuid := 'f2000000-0000-0000-0000-000000000002';
  reqF2 uuid := 'f2000000-0000-0000-0000-000000000003';
  aprovF uuid := 'f2000000-0000-0000-0000-000000000004';
  ownerG uuid := 'f2000000-0000-0000-0000-000000000005';
  accF uuid := 'f3000000-0000-0000-0000-000000000001';
  v json;
  v_req1 uuid; v_req2 uuid; v_req3 uuid; v_req4 uuid; v_req5 uuid;
  v_status text; v_text text; v_created_by uuid; v_cnt int;
begin
  -- T1: requisitante cria a própria requisição via RPC; created_by fica gravado
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F', 'Aprov F', null, null, 15000, current_date, 'Compra de material', 'Material', 'expense', null, null, null, null);
  v_req1 := (v->>'id')::uuid;
  select status::text, created_by into v_status, v_created_by from requisitions where id = v_req1;
  insert into _tr(name,passed,detail) values('T1 create_requisition grava created_by e status pendente',
    v_status = 'pendente' and v_created_by = reqF, 'status='||v_status||' created_by='||coalesce(v_created_by::text,'null'));

  -- T2: quem criou não pode aprovar a própria requisição [Crítico #1]
  begin
    perform approve_requisition(v_req1, accF, orgF, false);
    insert into _tr(name,passed,detail) values('T2 autoaprovacao bloqueada', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T2 autoaprovacao bloqueada', sqlerrm like '%própria requisição%', sqlerrm);
  end;

  -- T3: aprovador (não é quem criou) aprova sem desembolsar
  perform set_config('request.jwt.claims', json_build_object('sub', aprovF, 'role','authenticated')::text, true);
  v := approve_requisition(v_req1, accF, orgF, false);
  select status::text into v_status from requisitions where id = v_req1;
  insert into _tr(name,passed,detail) values('T3 aprovador diferente do criador aprova', v_status = 'aguardando_desembolso', 'status='||v_status);

  -- T4/T5/T6: só o dono (ou owner/admin/finance) edita o próprio rascunho
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F2', 'Aprov F', null, null, 5000, current_date, 'Papelaria', 'Material', 'expense', null, null, null, null);
  v_req2 := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', reqF2, 'role','authenticated')::text, true);
  begin
    perform update_requisition_draft(v_req2, orgF, jsonb_build_object('purpose', 'Alterado por outro requisitante'));
    insert into _tr(name,passed,detail) values('T5 requisitante nao edita rascunho de outro', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T5 requisitante nao edita rascunho de outro', sqlerrm like '%próprias requisições%', sqlerrm);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := update_requisition_draft(v_req2, orgF, jsonb_build_object('purpose', 'Alterado pelo proprio criador'));
  select purpose into v_text from requisitions where id = v_req2;
  insert into _tr(name,passed,detail) values('T6 dono edita o proprio rascunho', v_text = 'Alterado pelo proprio criador', v_text);

  -- T7/T8/T9: só o dono (ou owner/admin/finance) apaga o próprio rascunho; owner pode apagar de outrem
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F3', 'Aprov F', null, null, 3000, current_date, 'Combustivel', 'Transporte', 'expense', null, null, null, null);
  v_req3 := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', reqF2, 'role','authenticated')::text, true);
  begin
    perform delete_requisition_draft(v_req3, orgF);
    insert into _tr(name,passed,detail) values('T8 requisitante nao apaga rascunho de outro', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T8 requisitante nao apaga rascunho de outro', sqlerrm like '%próprias requisições%', sqlerrm);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  perform delete_requisition_draft(v_req3, orgF);
  select count(*) into v_cnt from requisitions where id = v_req3;
  insert into _tr(name,passed,detail) values('T9 owner apaga rascunho de outrem', v_cnt = 0, 'restam '||v_cnt);

  -- T10/T11/T12/T13: reject_requisition — bloqueia autorejeição, exige motivo, funciona para terceiro
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F4', 'Aprov F', null, null, 8000, current_date, 'Manutencao', 'Servicos', 'expense', null, null, null, null);
  v_req4 := (v->>'id')::uuid;

  begin
    perform reject_requisition(v_req4, orgF, 'Motivo qualquer');
    insert into _tr(name,passed,detail) values('T11 autorejeicao bloqueada', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T11 autorejeicao bloqueada', sqlerrm like '%própria requisição%', sqlerrm);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', aprovF, 'role','authenticated')::text, true);
  begin
    perform reject_requisition(v_req4, orgF, '');
    insert into _tr(name,passed,detail) values('T12 motivo obrigatorio', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T12 motivo obrigatorio', sqlerrm like '%Motivo%', sqlerrm);
  end;

  v := reject_requisition(v_req4, orgF, 'Sem verba disponivel este mes');
  select status::text into v_status from requisitions where id = v_req4;
  insert into _tr(name,passed,detail) values('T13 aprovador rejeita com motivo', v_status = 'reprovado', 'status='||v_status);

  -- T14/T15/T16: escrita direta na tabela continua bloqueada para authenticated [Crítico #2/#3]
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into requisitions (organization_id, number, requester, approver, amount, date, purpose, category, status, type, created_by)
    values (orgF, 'RQ-HACK', 'X', 'Y', 1, current_date, 'Z', 'Z', 'desembolsada', 'expense', reqF);
    execute 'reset role';
    insert into _tr(name,passed,detail) values('T14 INSERT direto bloqueado', false, 'nao lancou excecao');
  exception when others then
    execute 'reset role';
    insert into _tr(name,passed,detail) values('T14 INSERT direto bloqueado', true, sqlerrm);
  end;

  execute 'set local role authenticated';
  begin
    update requisitions set status = 'pendente' where id = v_req1;
    execute 'reset role';
    insert into _tr(name,passed,detail) values('T15 UPDATE direto bloqueado (fecha via de duplo desembolso)', false, 'nao lancou excecao');
  exception when others then
    execute 'reset role';
    insert into _tr(name,passed,detail) values('T15 UPDATE direto bloqueado (fecha via de duplo desembolso)', true, sqlerrm);
  end;

  execute 'set local role authenticated';
  begin
    delete from requisitions where id = v_req4;
    execute 'reset role';
    insert into _tr(name,passed,detail) values('T16 DELETE direto bloqueado (fecha via de apagar decidida)', false, 'nao lancou excecao');
  exception when others then
    execute 'reset role';
    insert into _tr(name,passed,detail) values('T16 DELETE direto bloqueado (fecha via de apagar decidida)', true, sqlerrm);
  end;

  -- T17/T18: isolamento entre organizações
  perform set_config('request.jwt.claims', json_build_object('sub', ownerG, 'role','authenticated')::text, true);
  begin
    perform approve_requisition(v_req2, accF, orgG, false);
    insert into _tr(name,passed,detail) values('T17 org errada nao encontra requisicao de outra org', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T17 org errada nao encontra requisicao de outra org', sqlerrm like '%encontrada%', sqlerrm);
  end;

  begin
    perform create_requisition(orgF, 'Invasor', 'Y', null, null, 1, current_date, 'Z', 'Z', 'expense', null, null, null, null);
    insert into _tr(name,passed,detail) values('T18 utilizador de outra org nao cria requisicao', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T18 utilizador de outra org nao cria requisicao', sqlerrm like '%permissão%', sqlerrm);
  end;

  -- T19: desembolso completo muda status; repetir sobre a mesma já não é 'pendente'
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := create_requisition(orgF, 'Req F5', 'Aprov F', null, null, 20000, current_date, 'Equipamento', 'Ativos', 'expense', null, null, null, null);
  v_req5 := (v->>'id')::uuid;

  perform set_config('request.jwt.claims', json_build_object('sub', ownerF, 'role','authenticated')::text, true);
  v := approve_requisition(v_req5, accF, orgF, true);
  select status::text into v_status from requisitions where id = v_req5;
  insert into _tr(name,passed,detail) values('T19a desembolso completo muda status', v_status = 'aprovado', 'status='||v_status);

  begin
    perform approve_requisition(v_req5, accF, orgF, true);
    insert into _tr(name,passed,detail) values('T19b repetir approve sobre ja aprovada falha', false, 'nao lancou excecao');
  exception when others then
    insert into _tr(name,passed,detail) values('T19b repetir approve sobre ja aprovada falha', sqlerrm like '%pendente%', sqlerrm);
  end;
end $$;

select id, name, passed, detail from _tr order by id;
