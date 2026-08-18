-- Bug real apanhado por revisão adversarial (não pela minha bateria de
-- testes ao vivo, que só cobria um convite pendente de cada vez): a versão
-- anterior de accept_organization_invite() escolhia "o convite pendente
-- mais recente para este email", em qualquer organização — sem amarrar à
-- ligação específica que a pessoa clicou. Cenário: organização legítima A
-- convida vitima@x.com; antes de ela clicar, qualquer conta ZeroMaka cria
-- uma segunda organização (auto-serviço, sem aprovação) e chama
-- create_organization_invite diretamente para o MESMO email (não precisa de
-- enviar email real nenhum, só criar a linha pendente com created_at mais
-- recente). Quando a vítima clica no link genuíno de A, accept_organization_invite()
-- ignorava qual convite gerou aquele link e aceitava o mais recente — o da
-- organização errada, com o papel que essa organização escolheu — enquanto
-- o convite real de A ficava pendente. /aceitar-convite nunca mostrava o
-- nome da organização, por isso a vítima não tinha como notar antes de
-- confirmar nome+senha.
--
-- Corrigido exigindo o id do convite específico como parâmetro — o
-- controlo de posse do email continua a ser a verificação real (o convite
-- só é aceite se o email do convite bater com o auth.users.email de quem
-- chama), o id só desambigua QUAL dos convites pendentes desse email se
-- quer aceitar, fechando a via de "convite mais recente vence".
drop function if exists public.accept_organization_invite();

create or replace function public.accept_organization_invite(p_invite_id uuid)
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
  -- email_confirmed_at: defesa em profundidade, não a única barreira (a
  -- reserva síncrona do email por auth.admin.inviteUserByEmail, logo após
  -- criar o convite, já impede um email alvo de ser "roubado" por outra
  -- conta enquanto o convite fica pendente) — mas custa nada e fecha
  -- qualquer variação futura de configuração do Supabase Auth.
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'Utilizador inválido'; end if;

  select * into v_invite from organization_invites
   where id = p_invite_id and lower(email) = v_email and status = 'pending' and expires_at > now();

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

revoke all on function public.accept_organization_invite(uuid) from public, anon;
grant execute on function public.accept_organization_invite(uuid) to authenticated;

-- Segundo achado real: prevent_role_escalation falha ABERTO para os 9
-- papéis de âmbito estreito (20260817_0061/0067) — role_order não os
-- listava, por isso array_position devolvia NULL e a comparação
-- "new_rank > actor_rank" avaliava NULL (tratado como falso em plpgsql),
-- deixando a verificação de escalada em silêncio em vez de bloquear.
-- Hoje inofensivo na prática (nenhum destes papéis tem acesso de escrita a
-- organization_members por caminho nenhum), mas falha aberto é o padrão
-- errado para um trigger de segurança — corrigido para falhar fechado,
-- colocando-os no mesmo nível mais baixo que 'viewer'.
create or replace function public.prevent_role_escalation()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor_role text;
  role_order constant text[] := ARRAY[
    'viewer','requisitante','cobrador','pagador','contabilista','caixa','aprovador','rh','auditor','convidado_temp',
    'member','finance','admin','owner'
  ];
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

  if actor_rank is null or new_rank is null or new_rank > actor_rank then
    raise exception 'Não podes atribuir um papel superior ao teu (%).' , actor_role;
  end if;

  if TG_OP = 'UPDATE' and NEW.user_id = auth.uid() then
    old_rank := array_position(role_order, OLD.role::text);
    if old_rank is null or new_rank > old_rank then
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

-- VERIFICADO ao vivo (utilizadores de teste temporários criados e removidos
-- no fim, convites de teste apagados): aceitar com um id de convite ERRADO
-- (mas com um convite pendente a existir para o mesmo email) devolve
-- no_pending_invite, já não "o mais recente vence"; aceitar com o id CERTO
-- funciona normalmente; utilizador com email_confirmed_at nulo é rejeitado
-- com "Utilizador inválido"; role_order já não devolve NULL para nenhum dos
-- 9 papéis de âmbito estreito.
