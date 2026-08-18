-- Bug apanhado ao testar a migração anterior: faltava o cast ::member_role
-- no UPDATE (o INSERT irmão em add_organization_member já tinha). Sem isto,
-- MUDAR o papel de um membro existente falhava sempre com "column role is
-- of type member_role but expression is of type text" — parece pré-existente,
-- não introduzido por esta sessão (a função já vinha sem o cast antes de eu
-- alargar a lista de papéis aceites nesta mesma leva de trabalho).
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
  update organization_members set role = p_role::member_role where organization_id = p_org_id and user_id = p_user_id;
  v_new := jsonb_build_object('user_id', p_user_id, 'old_role', v_old, 'new_role', p_role);
  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, v_uid, 'UPDATE', 'organization_members', p_user_id, jsonb_build_object('role', v_old), v_new);
  return v_new;
end;
$function$;

-- VERIFICADO ao vivo antes de escrever este ficheiro (org de teste, Test Org
-- F, papel do membro de teste reposto no fim): owner muda o papel do membro
-- de teste para 'cobrador' via RPC com sucesso; um papel inexistente
-- ('super_admin_hacker') é corretamente rejeitado com "Papel inválido";
-- reposto a 'admin' no fim, confirmado.
