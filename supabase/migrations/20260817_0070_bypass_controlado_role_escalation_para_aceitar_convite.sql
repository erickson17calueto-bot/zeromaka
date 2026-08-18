-- Bug apanhado em teste ao vivo da migração anterior: accept_organization_invite()
-- insere a própria adesão do convidado (SECURITY DEFINER, decisão já
-- validada pela própria função ao casar o convite pendente com o email
-- autenticado), mas o trigger prevent_role_escalation bloqueia SEMPRE um
-- não-membro a inserir-se numa organização que já tem outros membros — a
-- única exceção que já existia era "organização acabada de nascer, zero
-- membros" (criação de organização nova). SECURITY DEFINER não desativa
-- triggers, por isso a verificação interna do trigger continuava a correr e
-- a rejeitar com "Não és membro desta organização.".
--
-- Corrigido com uma GUC de transação (app.bypass_role_escalation), no mesmo
-- espírito do bypass já usado em _post_settlement_ledger_entry: só código de
-- servidor dentro de outra função SECURITY DEFINER consegue ativá-la —
-- nenhuma rota pública do PostgREST permite `set_config` arbitrário — e ela
-- expira sozinha no fim da transação mesmo que nada a desligue depois.
create or replace function public.prevent_role_escalation()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor_role text;
  role_order constant text[] := ARRAY['viewer','member','finance','admin','owner'];
  actor_rank int;
  new_rank int;
  old_rank int;
begin
  if current_setting('app.bypass_role_escalation', true) = 'on' then
    return NEW;
  end if;

  select m.role::text into actor_role
  from public.organization_members m
  where m.user_id = auth.uid() and m.organization_id = NEW.organization_id;

  if actor_role is null then
    if exists (
      select 1 from public.organization_members m2
      where m2.organization_id = NEW.organization_id
    ) then
      raise exception 'Não és membro desta organização.';
    end if;
    return NEW;
  end if;

  actor_rank := array_position(role_order, actor_role);
  new_rank   := array_position(role_order, NEW.role::text);

  if new_rank > actor_rank then
    raise exception 'Não podes atribuir um papel superior ao teu (%).' , actor_role;
  end if;

  if TG_OP = 'UPDATE' and NEW.user_id = auth.uid() then
    old_rank := array_position(role_order, OLD.role::text);
    if new_rank > old_rank then
      raise exception 'Não podes elevar o teu próprio papel.';
    end if;
  end if;

  if TG_OP = 'UPDATE' and OLD.role::text = 'owner' and NEW.role::text != 'owner' then
    if (select count(*) from public.organization_members
        where organization_id = NEW.organization_id
          and role = 'owner'
          and user_id != OLD.user_id) = 0 then
      raise exception 'Não é possível remover o último owner da organização.';
    end if;
  end if;

  return NEW;
end;
$function$;

create or replace function public.accept_organization_invite()
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'Utilizador inválido'; end if;

  select * into v_invite from organization_invites
   where lower(email) = v_email and status = 'pending' and expires_at > now()
   order by created_at desc
   limit 1;

  if v_invite.id is null then
    return json_build_object('accepted', false, 'reason', 'no_pending_invite');
  end if;

  if exists (select 1 from organization_members where organization_id = v_invite.organization_id and user_id = v_uid) then
    update organization_invites set status = 'accepted' where id = v_invite.id;
    return json_build_object('accepted', false, 'reason', 'already_member');
  end if;

  perform set_config('app.bypass_role_escalation', 'on', true);
  insert into organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, v_uid, v_invite.role::member_role);
  perform set_config('app.bypass_role_escalation', 'off', true);

  update organization_invites set status = 'accepted' where id = v_invite.id;
  update profiles set current_org_id = v_invite.organization_id where id = v_uid;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (v_invite.organization_id, v_uid, 'INSERT', 'organization_members', v_uid,
          jsonb_build_object('role', v_invite.role, 'via_invite', v_invite.id));

  return json_build_object('accepted', true, 'organization_id', v_invite.organization_id, 'role', v_invite.role);
end;
$function$;

-- VERIFICADO ao vivo (utilizador de teste temporário criado e removido no
-- fim, convites de teste apagados): convite expirado não é aceite
-- (no_pending_invite); convite válido é aceite (accepted:true, organização e
-- papel corretos); organization_members passa a ter a pessoa com o papel do
-- convite; profiles.current_org_id atualizado; aceitar uma segunda vez
-- devolve no_pending_invite; convite pendente para quem entretanto já é
-- membro devolve already_member (e marca o convite como aceite na mesma);
-- um admin normal continua impedido de promover alguém a owner por
-- change_organization_member_role (bloqueado pela própria lista de papéis
-- aceites da função, antes mesmo de chegar ao trigger) — confirma que o
-- bypass não ficou ligado para além do INSERT único que o precisa.
