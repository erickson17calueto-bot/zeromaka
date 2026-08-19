-- Fase 2: seed de role_action_permissions + user_can_do(). Reaproveita a
-- org test-org-req-lock-f do phase10 e acrescenta membros dos restantes
-- papéis estreitos para cobrir os 9 no mesmo teste.

set session_replication_role = replica;
delete from organization_members where organization_id = 'f1000000-0000-0000-0000-000000000001'
  and user_id in ('f2000000-0000-0000-0000-000000000006','f2000000-0000-0000-0000-000000000007','f2000000-0000-0000-0000-000000000008','f2000000-0000-0000-0000-000000000009','f2000000-0000-0000-0000-00000000000a','f2000000-0000-0000-0000-00000000000b');
delete from auth.users where email like '%@treqlock2.test';

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('f2000000-0000-0000-0000-000000000006','caixaF@treqlock2.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000007','rhF@treqlock2.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000008','cobradorF@treqlock2.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-000000000009','pagadorF@treqlock2.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-00000000000a','contabF@treqlock2.test','{}','authenticated','authenticated'),
  ('f2000000-0000-0000-0000-00000000000b','auditorF@treqlock2.test','{}','authenticated','authenticated');

insert into organization_members (organization_id, user_id, role) values
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000006','caixa'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000007','rh'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000008','cobrador'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000009','pagador'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-00000000000a','contabilista'),
  ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-00000000000b','auditor');
set session_replication_role = origin;

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  reqF uuid := 'f2000000-0000-0000-0000-000000000002';
  aprovF uuid := 'f2000000-0000-0000-0000-000000000004';
  caixaF uuid := 'f2000000-0000-0000-0000-000000000006';
  rhF uuid := 'f2000000-0000-0000-0000-000000000007';
  cobradorF uuid := 'f2000000-0000-0000-0000-000000000008';
  pagadorF uuid := 'f2000000-0000-0000-0000-000000000009';
  contabF uuid := 'f2000000-0000-0000-0000-00000000000a';
  auditorF uuid := 'f2000000-0000-0000-0000-00000000000b';
  r boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'requisitions', 'create_draft');
  insert into _tr(name,passed,detail) values('requisitante pode create_draft', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'edit_own_draft');
  insert into _tr(name,passed,detail) values('requisitante pode edit_own_draft', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'approve');
  insert into _tr(name,passed,detail) values('requisitante NAO pode approve', r = false, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'disburse');
  insert into _tr(name,passed,detail) values('requisitante NAO pode disburse', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', aprovF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'requisitions', 'approve');
  insert into _tr(name,passed,detail) values('aprovador pode approve', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'reject');
  insert into _tr(name,passed,detail) values('aprovador pode reject', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'create_draft');
  insert into _tr(name,passed,detail) values('aprovador NAO pode create_draft', r = false, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'disburse');
  insert into _tr(name,passed,detail) values('aprovador NAO pode disburse', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', caixaF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'requisitions', 'disburse');
  insert into _tr(name,passed,detail) values('caixa pode disburse requisicoes', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'loans', 'disburse');
  insert into _tr(name,passed,detail) values('caixa pode disburse emprestimos', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'approve');
  insert into _tr(name,passed,detail) values('caixa NAO pode approve', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', rhF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'loans', 'disburse');
  insert into _tr(name,passed,detail) values('rh pode disburse emprestimo', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'loans', 'receive');
  insert into _tr(name,passed,detail) values('rh pode receive devolucao', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'loans', 'reverse');
  insert into _tr(name,passed,detail) values('rh NAO pode reverse', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', cobradorF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'obligations_receivable', 'receive');
  insert into _tr(name,passed,detail) values('cobrador pode receive', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'obligations_receivable', 'create_draft');
  insert into _tr(name,passed,detail) values('cobrador NAO pode create_draft', r = false, 'obtido='||r);
  r := user_can_do(orgF, 'obligations_receivable', 'reverse');
  insert into _tr(name,passed,detail) values('cobrador NAO pode reverse', r = false, 'obtido='||r);
  r := user_can_do(orgF, 'obligations_payable', 'settle');
  insert into _tr(name,passed,detail) values('cobrador NAO pode settle (papel errado)', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', pagadorF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'obligations_payable', 'settle');
  insert into _tr(name,passed,detail) values('pagador pode settle', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'obligations_payable', 'create_draft');
  insert into _tr(name,passed,detail) values('pagador NAO pode create_draft', r = false, 'obtido='||r);
  r := user_can_do(orgF, 'obligations_receivable', 'receive');
  insert into _tr(name,passed,detail) values('pagador NAO pode receive (papel errado)', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', contabF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'reports', 'export');
  insert into _tr(name,passed,detail) values('contabilista pode export', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'requisitions', 'approve');
  insert into _tr(name,passed,detail) values('contabilista NAO pode approve', r = false, 'obtido='||r);

  perform set_config('request.jwt.claims', json_build_object('sub', auditorF, 'role','authenticated')::text, true);
  r := user_can_do(orgF, 'audit_log', 'view_audit');
  insert into _tr(name,passed,detail) values('auditor pode view_audit', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'reports', 'export');
  insert into _tr(name,passed,detail) values('auditor pode export', r = true, 'obtido='||r);
  r := user_can_do(orgF, 'loans', 'disburse');
  insert into _tr(name,passed,detail) values('auditor NAO pode disburse', r = false, 'obtido='||r);

  -- isolamento: mesmo utilizador (requisitante em orgF), org inexistente nao concede nada
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  r := user_can_do('00000000-0000-0000-0000-000000000000'::uuid, 'requisitions', 'create_draft');
  insert into _tr(name,passed,detail) values('isolamento: org inexistente nao concede', r = false, 'obtido='||r);
end $$;

select id, name, passed, detail from _tr order by id;
