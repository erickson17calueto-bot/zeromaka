-- Convite por email real: a pessoa não precisa de já ter conta ZeroMaka.
-- Duas partes deliberadamente separadas: esta tabela + RPCs (permissão via
-- sessão normal do utilizador, sem service_role nenhuma) e, à parte no
-- código da aplicação, uma rota de servidor que usa a service_role só para
-- disparar o email via auth.admin.inviteUserByEmail — a PRIMEIRA vez que
-- este projeto usa essa chave.

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null,
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- Só um convite pendente por email+organização — reconvidar substitui o anterior.
create unique index if not exists organization_invites_pending_unique
  on public.organization_invites (organization_id, lower(email))
  where status = 'pending';

create index if not exists organization_invites_email_pending_idx
  on public.organization_invites (lower(email))
  where status = 'pending';

alter table public.organization_invites enable row level security;

-- Só leitura direta (para a lista de "convites pendentes" na aba Equipa).
-- Toda a escrita passa pelas RPCs abaixo, nunca por insert/update direto do
-- cliente — assim cada mutação fica com o seu próprio ponto de validação.
create policy "org_invites_select" on public.organization_invites
  for select to authenticated
  using (organization_id in (select public.user_admin_org_ids()));

revoke all on public.organization_invites from public, anon;
grant select on public.organization_invites to authenticated;

create or replace function public.create_organization_invite(p_org_id uuid, p_email text, p_role text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_existing_user uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then
    raise exception 'Só o dono ou administrador pode convidar';
  end if;
  if p_role not in ('admin', 'finance', 'viewer', 'requisitante', 'cobrador', 'pagador', 'contabilista', 'caixa', 'aprovador', 'rh', 'auditor', 'convidado_temp') then
    raise exception 'Papel inválido';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email inválido';
  end if;

  select id into v_existing_user from auth.users where lower(email) = v_email;
  if v_existing_user is not null then
    if exists (select 1 from organization_members where organization_id = p_org_id and user_id = v_existing_user) then
      raise exception 'Esta pessoa já pertence à organização';
    end if;
    raise exception 'Esta pessoa já tem conta ZeroMaka — usa "Adicionar por conta existente" em vez de convite';
  end if;

  delete from organization_invites
   where organization_id = p_org_id and lower(email) = v_email and status = 'pending';

  insert into organization_invites (organization_id, email, role, invited_by)
  values (p_org_id, v_email, p_role, v_uid)
  returning id into v_id;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (p_org_id, v_uid, 'INSERT', 'organization_invites', v_id,
          jsonb_build_object('email', v_email, 'role', p_role));

  return v_id;
end;
$function$;

revoke all on function public.create_organization_invite(uuid, text, text) from public, anon;
grant execute on function public.create_organization_invite(uuid, text, text) to authenticated;

create or replace function public.revoke_organization_invite(p_org_id uuid, p_invite_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then
    raise exception 'Só o dono ou administrador pode revogar convites';
  end if;

  update organization_invites set status = 'revoked'
   where id = p_invite_id and organization_id = p_org_id and status = 'pending';
  if not found then raise exception 'Convite não encontrado ou já não está pendente'; end if;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data)
  values (p_org_id, v_uid, 'UPDATE', 'organization_invites', p_invite_id, jsonb_build_object('status', 'revoked'));

  return json_build_object('id', p_invite_id, 'revoked', true);
end;
$function$;

revoke all on function public.revoke_organization_invite(uuid, uuid) from public, anon;
grant execute on function public.revoke_organization_invite(uuid, uuid) to authenticated;

create or replace function public.list_organization_invites(p_org_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;

  select coalesce(json_agg(row_to_json(i) order by i.created_at desc), '[]'::json) into v_result
  from (
    select id, email, role, status, created_at, expires_at
    from organization_invites
    where organization_id = p_org_id and status = 'pending'
  ) i;
  return v_result;
end;
$function$;

revoke all on function public.list_organization_invites(uuid) from public, anon;
grant execute on function public.list_organization_invites(uuid) to authenticated;

-- Chamada pelo próprio convidado, logo depois de trocar o código PKCE por
-- sessão no /auth/callback. Não verifica user_admin_org_ids() de propósito —
-- quem chama não é admin de nada ainda; a autorização aqui é "o convite
-- pendente é para o MEU email", não "sou admin". SECURITY DEFINER contorna a
-- policy de insert em organization_members (que exige admin) tal como
-- add_organization_member já faz para o admin que convida. Nota: o trigger
-- prevent_role_escalation precisou de um ajuste à parte (20260817_0070) para
-- deixar de bloquear esta própria inserção — ver esse ficheiro.
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

  insert into organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, v_uid, v_invite.role::member_role);

  update organization_invites set status = 'accepted' where id = v_invite.id;
  update profiles set current_org_id = v_invite.organization_id where id = v_uid;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (v_invite.organization_id, v_uid, 'INSERT', 'organization_members', v_uid,
          jsonb_build_object('role', v_invite.role, 'via_invite', v_invite.id));

  return json_build_object('accepted', true, 'organization_id', v_invite.organization_id, 'role', v_invite.role);
end;
$function$;

revoke all on function public.accept_organization_invite() from public, anon;
grant execute on function public.accept_organization_invite() to authenticated;

-- VERIFICADO ao vivo (Test Org F, papel do membro de teste reposto e
-- utilizador de teste temporário removido no fim): owner cria convite para
-- email novo; convite para email já membro recusado; convite para email com
-- conta mas não-membro recusado com mensagem própria; papel inválido e email
-- malformado recusados; reconvite do mesmo email substitui o pendente
-- anterior sem violar a unicidade; admin (não só owner) também convida;
-- viewer não pode convidar nem listar convites; revogar funciona e some da
-- listagem; revogar duas vezes falha. accept_organization_invite testada à
-- parte após a correção do trigger em 20260817_0070 — ver esse ficheiro.
