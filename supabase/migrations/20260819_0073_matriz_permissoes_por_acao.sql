-- Fase 2 do plano de evolução de permissões (auditoria 2026-08-19): tabela
-- aditiva role_action_permissions + função user_can_do(), para separar
-- verbos que hoje partilham um único bit can_write em role_resource_permissions.
--
-- O achado [Crítico] da Fase 1 (autoaprovação em requisitions) tinha uma
-- causa estrutural, não só local àquela tabela: role_resource_permissions
-- é (role, resource) → um único can_write. "Requisitante cria" e "aprovador
-- decide" são ações diferentes sobre o mesmo recurso 'requisitions', mas
-- partilhavam o mesmo bit — foi corrigido na Fase 1 com uma verificação
-- ad-hoc de created_by dentro da própria RPC, não uma distinção real de
-- permissão. Esta fase generaliza isso: role_action_permissions é
-- (role, resource, action) → allowed, permitindo dar a requisitante
-- create_draft/edit_own_draft e a aprovador approve/reject como bits
-- INDEPENDENTES, em vez de um único can_write partilhado.
--
-- Puramente ADITIVA e sem efeito ainda: nenhuma RPC chama user_can_do()
-- nesta fase — role_resource_permissions/user_can_view/user_can_write
-- continuam a governar tudo como antes. A Fase 3 é que troca a
-- verificação interna de approve_requisition/reject_requisition/
-- disburse_requisition (e das RPCs equivalentes de obrigações) para usar
-- esta tabela em vez do can_write genérico. Sem essa troca, esta migração
-- não muda nenhum comportamento observável.
--
-- Convenção mantida de role_resource_permissions: só se insere uma linha
-- quando a combinação é relevante para descrever a fronteira do papel —
-- para os papéis estreitos (requisitante/aprovador/caixa/rh/cobrador/
-- pagador/contabilista/auditor), o par oposto (ex: requisitante.approve)
-- é inserido explicitamente como false, para o próprio seed documentar a
-- separação em vez de depender só do default-deny por ausência de linha.
-- convidado_temp não recebe nenhuma linha — já não tinha nenhuma em
-- role_resource_permissions, mantém-se sem acesso nenhum.
--
-- 'submit' (uma das 14 ações pedidas) fica de fora do seed: nenhum recurso
-- hoje tem um estado real de rascunho→submetido distinto (create_requisition
-- já cria diretamente em 'pendente', equivalente a "submetida na hora") —
-- ação reservada no vocabulário para o dia em que essa distinção existir,
-- sem linha nenhuma até lá (create_draft já cobre o "criar" de facto).
-- 'manage_team'/'manage_settings' também ficam sem linha para os 9 papéis
-- estreitos: essas ações já são de facto exclusivas de owner/admin via
-- user_admin_org_ids() nas RPCs de equipa/organização, nenhum papel
-- estreito deveria tê-las — o seed fica vazio para não sugerir o contrário.

create table if not exists public.role_action_permissions (
  role member_role not null,
  resource text not null,
  action text not null,
  allowed boolean not null default false,
  primary key (role, resource, action)
);

alter table public.role_action_permissions enable row level security;

drop policy if exists "role_action_permissions_select" on public.role_action_permissions;
create policy "role_action_permissions_select" on public.role_action_permissions for select
  using (true);

-- Ao contrário de role_resource_permissions (que ainda tem INSERT/UPDATE/
-- DELETE/TRUNCATE concedidos a authenticated sem política — achado
-- [Baixo] da auditoria, revogação agendada para a fase de limpeza), esta
-- tabela nova já nasce só de leitura: nenhuma via de escrita para
-- authenticated desde o início.
revoke all on public.role_action_permissions from public, anon, authenticated;
grant select on public.role_action_permissions to authenticated;

create or replace function public.user_can_do(p_org_id uuid, p_resource text, p_action text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(
    (select rap.allowed
     from public.organization_members om
     join public.role_action_permissions rap on rap.role = om.role and rap.resource = p_resource and rap.action = p_action
     where om.organization_id = p_org_id and om.user_id = auth.uid()
       and (om.expires_at is null or om.expires_at > now())),
    false
  );
$function$;

revoke all on function public.user_can_do(uuid, text, text) from public, anon;
grant execute on function public.user_can_do(uuid, text, text) to authenticated;

-- ---- Seed ----

insert into role_action_permissions (role, resource, action, allowed) values
  -- requisitante: cria e edita a própria; nunca decide nem desembolsa
  ('requisitante', 'requisitions', 'create_draft', true),
  ('requisitante', 'requisitions', 'edit_own_draft', true),
  ('requisitante', 'requisitions', 'approve', false),
  ('requisitante', 'requisitions', 'reject', false),
  ('requisitante', 'requisitions', 'disburse', false),

  -- aprovador: decide; nunca cria nem move dinheiro
  ('aprovador', 'requisitions', 'approve', true),
  ('aprovador', 'requisitions', 'reject', true),
  ('aprovador', 'requisitions', 'create_draft', false),
  ('aprovador', 'requisitions', 'edit_own_draft', false),
  ('aprovador', 'requisitions', 'disburse', false),

  -- caixa: só executa o desembolso já decidido (requisições e empréstimos)
  ('caixa', 'requisitions', 'disburse', true),
  ('caixa', 'loans', 'disburse', true),

  -- rh: concede e recebe devoluções de empréstimos/adiantamentos; nunca reverte
  ('rh', 'loans', 'disburse', true),
  ('rh', 'loans', 'receive', true),
  ('rh', 'loans', 'reverse', false),

  -- cobrador: só regista recebimento de clientes; nunca cria/edita/reverte a obrigação
  ('cobrador', 'obligations_receivable', 'receive', true),
  ('cobrador', 'obligations_receivable', 'create_draft', false),
  ('cobrador', 'obligations_receivable', 'edit_own_draft', false),
  ('cobrador', 'obligations_receivable', 'reverse', false),

  -- pagador: só regista pagamento a fornecedores; nunca cria/edita/reverte a obrigação
  ('pagador', 'obligations_payable', 'settle', true),
  ('pagador', 'obligations_payable', 'create_draft', false),
  ('pagador', 'obligations_payable', 'edit_own_draft', false),
  ('pagador', 'obligations_payable', 'reverse', false),

  -- contabilista: só consulta e exporta, nunca decide nem move dinheiro
  ('contabilista', 'reports', 'export', true),

  -- auditor: só consulta auditoria e exporta evidência
  ('auditor', 'audit_log', 'view_audit', true),
  ('auditor', 'reports', 'export', true)
on conflict (role, resource, action) do update set allowed = excluded.allowed;
