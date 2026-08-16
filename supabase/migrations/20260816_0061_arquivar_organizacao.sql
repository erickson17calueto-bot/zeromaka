-- Fase 3 do plano de consolidação: arquivar uma organização inteira.
-- Só existia reset_organization_data (limpa dados financeiros, mantém
-- empresa e equipa). Não havia forma de "desligar" a organização em si.
--
-- Decisão: ARQUIVAR (reversível), não apagar fisicamente. Nada é destruído;
-- fica escondida e bloqueada para escrita, mas o antigo owner continua a
-- poder ler o histórico. Reversão fica só por suporte direto na base de
-- dados por agora — sem botão de UI nesta fase.

alter table public.organizations add column if not exists is_archived boolean not null default false;

-- user_org_ids() (leitura) fica sem alteração de propósito: uma organização
-- arquivada continua legível pelo antigo owner. Só as duas funções que
-- controlam ESCRITA passam a excluir organizações arquivadas — e como 33
-- funções (RPCs de mutação + policies de INSERT/UPDATE em toda a app) já
-- dependem de user_writable_org_ids()/user_admin_org_ids(), isto basta para
-- bloquear escrita em toda a aplicação sem tocar em mais nada, incluindo a
-- própria linha de organizations (confirmado ao testar: tentar reverter
-- is_archived como o próprio owner autenticado, em vez de como postgres,
-- é rejeitado pela mesma policy — a organização fica bloqueada até para si
-- própria, o que é o comportamento correto).
create or replace function public.user_writable_org_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select om.organization_id
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = auth.uid()
    and om.role in ('owner', 'admin', 'finance')
    and not o.is_archived;
$$;

create or replace function public.user_admin_org_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select om.organization_id
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = auth.uid()
    and om.role in ('owner', 'admin')
    and not o.is_archived;
$$;

create or replace function public.archive_organization(p_org_id uuid, p_confirmation text)
returns json
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_name text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select om.role into v_role
  from organization_members om
  where om.organization_id = p_org_id and om.user_id = v_uid;

  if v_role is null then raise exception 'Sem acesso a esta organização'; end if;
  if v_role <> 'owner' then
    raise exception 'Apenas o proprietário da organização pode arquivá-la';
  end if;

  select o.name into v_name from organizations o where o.id = p_org_id and not o.is_archived;
  if v_name is null then raise exception 'Organização não encontrada ou já arquivada'; end if;

  if lower(btrim(coalesce(p_confirmation,''))) <> lower(btrim(v_name)) then
    raise exception 'Confirmação inválida: escreve exatamente o nome da organização';
  end if;

  update organizations set is_archived = true, updated_at = now() where id = p_org_id;

  -- Limpa current_org_id de QUALQUER perfil que apontasse para esta
  -- organização, não só o de quem arquivou — sem isto, um colega cujo
  -- current_org_id ainda apontasse para aqui continuaria a "entrar" numa
  -- organização escondida do seletor, sem forma óbvia de sair.
  update profiles set current_org_id = null where current_org_id = p_org_id;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (p_org_id, v_uid, 'UPDATE', 'organizations', p_org_id,
    jsonb_build_object('is_archived', false), jsonb_build_object('is_archived', true));

  return json_build_object('ok', true, 'organization', v_name);
end;
$$;

revoke all on function public.archive_organization(uuid, text) from public, anon;
grant execute on function public.archive_organization(uuid, text) to authenticated;

-- VERIFICADO ao vivo antes de escrever este ficheiro (org de teste, Test Org
-- F, depois revertida ao estado original): não-owner rejeitado; confirmação
-- errada rejeitada; arquivar com sucesso marca is_archived=true; limpa
-- current_org_id do owner E de um colega que também apontava para lá;
-- user_writable_org_ids() deixa de incluir a organização mas user_org_ids()
-- continua a incluir; uma escrita real (categoria nova) passa a falhar com
-- "Sem permissão nesta organização"; tentar arquivar de novo é rejeitado.
