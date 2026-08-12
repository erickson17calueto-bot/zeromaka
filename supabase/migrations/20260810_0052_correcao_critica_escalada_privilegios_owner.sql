-- CORREÇÃO CRÍTICA — escalada de privilégios cross-tenant
--
-- PROBLEMA (confirmado empiricamente antes da correção)
-- Qualquer utilizador autenticado conseguia inserir-se como OWNER de QUALQUER
-- organização. Duas falhas independentes alinhavam-se:
--
--   1. A policy de INSERT em organization_members permitia
--        (user_id = auth.uid()) OR (organization_id IN user_admin_org_ids())
--      O primeiro ramo autorizava qualquer pessoa a criar uma linha para si
--      própria em QUALQUER organização — não havia verificação de organização.
--
--   2. O trigger prevent_role_escalation(), que devia travar isto, tinha:
--        if actor_role is null then return NEW; end if;
--      Ou seja, quem NÃO era membro da organização passava sem verificação
--      nenhuma — exatamente o perfil do atacante. A verificação de níveis de
--      papel só se aplicava a quem já era membro.
--
-- Teste real: um utilizador registado sem qualquer ligação inseriu-se com
-- role='owner' numa organização alheia. O registo de teste foi removido.
-- Como o registo de contas é aberto, qualquer pessoa podia tornar-se owner de
-- qualquer empresa e ler/escrever todos os seus dados financeiros.
--
-- CORREÇÃO — duas camadas independentes:
--
-- (a) A policy passa a exigir ser admin/owner da organização de destino.
--     O ramo de auto-inserção não é necessário: create_organization e
--     complete_onboarding são SECURITY DEFINER (owner postgres) e as tabelas
--     não têm FORCE ROW LEVEL SECURITY, por isso essas funções não passam
--     pelo RLS. Confirmado que o frontend nunca insere aqui diretamente e que
--     não existe fluxo de convites que dependa disto.
--
-- (b) O trigger deixa de aceitar cegamente não-membros. O único caso legítimo
--     de quem ainda não é membro é o criador de uma organização acabada de
--     criar — e nesse instante a organização não tem nenhum membro. Passa a
--     ser essa a condição, em vez de "não sou membro, logo passo".
--
-- Verificado depois de aplicar: o ataque falha com "Não és membro desta
-- organização"; a criação de uma organização nova (registo de cliente novo)
-- continua a funcionar.

drop policy if exists "Admins can add members" on public.organization_members;

create policy "Admins can add members" on public.organization_members
  for insert
  with check (organization_id in (select public.user_admin_org_ids()));

create or replace function public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_role text;
  role_order constant text[] := ARRAY['viewer','member','finance','admin','owner'];
  actor_rank int;
  new_rank int;
  old_rank int;
begin
  select m.role::text into actor_role
  from public.organization_members m
  where m.user_id = auth.uid() and m.organization_id = NEW.organization_id;

  if actor_role is null then
    -- Antes devolvia NEW sem verificar nada, o que deixava qualquer
    -- não-membro inserir-se como owner. O único caso legítimo de quem ainda
    -- não é membro é o criador de uma organização nova — nesse momento a
    -- organização não tem membro nenhum.
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
