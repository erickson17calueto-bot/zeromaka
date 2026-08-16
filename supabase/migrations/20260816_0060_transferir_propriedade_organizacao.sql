-- Fase 2 do plano de consolidação do painel de administração: transferir a
-- propriedade de uma organização para outro membro já existente. Antes disto
-- não havia nenhuma forma de mudar quem é owner — só é atribuído uma vez, em
-- create_organization, e fica assim para sempre.
--
-- Desenho, para não repetir os dois problemas de segurança mais graves desta
-- sessão (RLS bypass e escalada de privilégios, ambos em organization_members):
--   * SECURITY DEFINER, como as outras RPCs de gestão de equipa
--     (add/remove/change_organization_member_role) — corre como o dono da
--     função e por isso ignora RLS (organization_members não tem FORCE ROW
--     LEVEL SECURITY), mas valida tudo explicitamente antes de escrever.
--   * Exige que quem chama seja owner de p_org_id, verificado dentro da
--     função — não confia só no trigger prevent_role_escalation.
--   * A pessoa alvo tem de já ser membro da organização (não cria acesso
--     novo, só promove quem já lá está).
--   * ORDEM IMPORTA: promove o novo owner primeiro, só depois despromove o
--     antigo para 'admin'. Ao contrário, o trigger prevent_role_escalation
--     (20260810_0052) rejeita com "não é possível remover o último owner",
--     porque nesse instante ainda não haveria nenhum outro — correto, só
--     falha na ordem errada.
--
-- VERIFICADO ao vivo antes de escrever este ficheiro (org de teste,
-- Test Org F): um não-membro é rejeitado; a transferência real funciona e
-- deixa exatamente 1 owner com os papéis corretos (antigo → admin, novo →
-- owner); o antigo owner (agora admin) já não consegue voltar a transferir;
-- auto-transferência é rejeitada com mensagem própria; revertido ao estado
-- original no final do teste.

create or replace function public.transfer_organization_ownership(p_org_id uuid, p_new_owner_user_id uuid)
returns json
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select role into v_caller_role from organization_members
  where organization_id = p_org_id and user_id = v_uid;
  if v_caller_role is distinct from 'owner' then
    raise exception 'Só o proprietário pode transferir a propriedade';
  end if;

  if p_new_owner_user_id = v_uid then
    raise exception 'Já és o proprietário desta organização';
  end if;

  select role into v_target_role from organization_members
  where organization_id = p_org_id and user_id = p_new_owner_user_id;
  if v_target_role is null then
    raise exception 'Essa pessoa não é membro desta organização';
  end if;

  update organization_members set role = 'owner'
  where organization_id = p_org_id and user_id = p_new_owner_user_id;

  update organization_members set role = 'admin'
  where organization_id = p_org_id and user_id = v_uid;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (
    p_org_id, v_uid, 'UPDATE', 'organization_members', p_new_owner_user_id,
    jsonb_build_object('owner', v_uid),
    jsonb_build_object('owner', p_new_owner_user_id, 'previous_owner_new_role', 'admin')
  );

  return json_build_object('new_owner', p_new_owner_user_id, 'previous_owner', v_uid);
end;
$$;

revoke all on function public.transfer_organization_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated;
