-- add_organization_member/change_organization_member_role tinham uma lista
-- fixa de papéis atribuíveis (admin/finance/viewer) que bloquearia os 9
-- papéis novos mesmo depois do frontend os oferecer. 'owner' continua fora
-- (nunca atribuível por aqui — só nasce na criação da organização ou por
-- transfer_organization_ownership) e 'member' continua fora (papel legado,
-- não se volta a atribuir a partir de agora).
create or replace function public.add_organization_member(p_org_id uuid, p_email text, p_role text)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_existing text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then
    raise exception 'Só o dono ou administrador pode adicionar membros';
  end if;
  if p_role not in ('admin', 'finance', 'viewer', 'requisitante', 'cobrador', 'pagador', 'contabilista', 'caixa', 'aprovador', 'rh', 'auditor', 'convidado_temp') then
    raise exception 'Papel inválido';
  end if;
  if v_email = '' then raise exception 'Indica o email da pessoa'; end if;

  select id into v_target from auth.users where lower(email) = v_email;
  if v_target is null then
    raise exception 'Não existe nenhuma conta ZeroMaka com o email %. A pessoa tem de criar conta primeiro.', v_email;
  end if;

  select role into v_existing from organization_members
   where organization_id = p_org_id and user_id = v_target;
  if v_existing is not null then
    raise exception 'Esta pessoa já pertence à organização (papel: %)', v_existing;
  end if;

  insert into organization_members (organization_id, user_id, role)
  values (p_org_id, v_target, p_role::member_role);

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (p_org_id, v_uid, 'INSERT', 'organization_members', v_target,
          jsonb_build_object('email', v_email, 'role', p_role, 'added_by', v_uid));

  return json_build_object('user_id', v_target, 'email', v_email, 'role', p_role);
end;
$function$;

-- NOTA: a versão de change_organization_member_role aplicada aqui tinha um
-- bug pré-existente (faltava ::member_role no UPDATE, o INSERT irmão acima
-- já tinha o cast) — apanhado ao testar esta própria migração e corrigido
-- na migração seguinte (20260817_0068). Ver esse ficheiro para a versão
-- final e a prova de que era pré-existente, não introduzido aqui.
create or replace function public.change_organization_member_role(p_org_id uuid, p_user_id uuid, p_role text)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_old text; v_new jsonb;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Só owner ou admin podem alterar permissões'; end if;
  if p_role not in ('admin', 'finance', 'viewer', 'requisitante', 'cobrador', 'pagador', 'contabilista', 'caixa', 'aprovador', 'rh', 'auditor', 'convidado_temp') then raise exception 'Papel inválido'; end if;
  select role into v_old from organization_members where organization_id = p_org_id and user_id = p_user_id;
  if v_old is null then raise exception 'Membro não encontrado'; end if;
  if v_old = 'owner' then raise exception 'O proprietário não pode ser rebaixado'; end if;
  update organization_members set role = p_role where organization_id = p_org_id and user_id = p_user_id;
  v_new := jsonb_build_object('user_id', p_user_id, 'old_role', v_old, 'new_role', p_role);
  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, v_uid, 'UPDATE', 'organization_members', p_user_id, jsonb_build_object('role', v_old), v_new);
  return v_new;
end;
$function$;
