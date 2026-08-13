-- Painel de administração — gestão de equipa.
--
-- A base de dados já tinha list_organization_members e
-- change_organization_member_role, mas faltavam as duas operações que fecham
-- o ciclo: adicionar e remover pessoas. Sem elas não havia forma de montar o
-- ecrã de equipa em /app/administracao.
--
-- DECISÃO: adicionar por email de conta JÁ EXISTENTE. Um sistema de convites
-- completo (token + email + aceitação + expiração) é bastante maior e exige
-- envio de email; fica para depois. Aqui, a pessoa cria a conta dela primeiro
-- e o administrador adiciona-a pelo email. O erro devolvido diz exatamente
-- isso quando o email não existe, para não parecer uma falha silenciosa.
--
-- SEGURANÇA (mesmas regras de change_organization_member_role):
--   * só owner/admin da organização em causa;
--   * NUNCA se pode atribuir 'owner' — evita criar um segundo dono e evita
--     que um admin se promova. A propriedade só nasce em create_organization;
--   * o owner não pode ser removido nem rebaixado;
--   * ninguém se pode remover a si próprio (evita deixar a organização órfã);
--   * search_path fixo com pg_temp, pela lição de 20260810_0054;
--   * tudo fica em audit_logs.
--
-- VERIFICADO com 6 cenários: email inexistente, papel 'owner' bloqueado,
-- membro duplicado, remoção do próprio bloqueada, member comum sem permissão,
-- e a lista a devolver email.

create or replace function public.add_organization_member(
  p_org_id uuid, p_email text, p_role text
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if p_role not in ('admin', 'finance', 'viewer') then
    raise exception 'Papel inválido. Usa admin, finance ou viewer';
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

create or replace function public.remove_organization_member(
  p_org_id uuid, p_user_id uuid
) returns json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then
    raise exception 'Só o dono ou administrador pode remover membros';
  end if;
  if p_user_id = v_uid then
    raise exception 'Não podes remover-te a ti próprio desta organização';
  end if;

  select role into v_role from organization_members
   where organization_id = p_org_id and user_id = p_user_id;
  if v_role is null then raise exception 'Membro não encontrado nesta organização'; end if;
  if v_role = 'owner' then raise exception 'O proprietário da organização não pode ser removido'; end if;

  delete from organization_members
   where organization_id = p_org_id and user_id = p_user_id;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data)
  values (p_org_id, v_uid, 'DELETE', 'organization_members', p_user_id,
          jsonb_build_object('role', v_role, 'removed_by', v_uid));

  return json_build_object('user_id', p_user_id, 'removed', true);
end;
$function$;

-- Passa a devolver também o email, para o ecrã de equipa poder identificar as
-- pessoas (o nome do perfil pode estar vazio). Continua a exigir ser membro
-- da organização para ver a lista.
create or replace function public.list_organization_members(p_org_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  select coalesce(json_agg(row_to_json(m) order by m.role, m.name), '[]'::json) into v_result
  from (
    select om.user_id, om.role, coalesce(p.full_name, 'Utilizador') as name, p.phone,
           u.email, om.created_at
    from organization_members om
    left join profiles p on p.id = om.user_id
    left join auth.users u on u.id = om.user_id
    where om.organization_id = p_org_id
  ) m;
  return v_result;
end;
$function$;

revoke all on function public.add_organization_member(uuid, text, text) from public, anon;
grant execute on function public.add_organization_member(uuid, text, text) to authenticated;
revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
