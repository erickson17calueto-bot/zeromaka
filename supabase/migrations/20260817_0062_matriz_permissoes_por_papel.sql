-- Sistema de permissões alargado: até agora só existiam 3 funções que
-- decidiam tudo (user_org_ids = lê, user_writable_org_ids = escreve,
-- user_admin_org_ids = gere equipa), e TODAS as tabelas financeiras usavam a
-- mesma regra de leitura sem nenhuma distinção por papel — confirmado antes
-- de mexer: as 11 SELECT policies das tabelas financeiras eram idênticas,
-- "organization_id in (select user_org_ids())".
--
-- Este ficheiro cria a infraestrutura: uma matriz papel×recurso configurável
-- (em vez de codificar cada papel novo em cada tabela, o que exigiria uma
-- migração sempre que se quisesse ajustar quem vê o quê) e duas funções que
-- as políticas de RLS passam a consultar.
--
-- Pré-requisito aplicado em migração própria (20260817_0061): o tipo
-- member_role foi alargado com 9 papéis novos — requisitante, cobrador,
-- pagador, contabilista, caixa, aprovador, rh, auditor, convidado_temp.
-- ALTER TYPE ... ADD VALUE não pode correr na mesma transação que usa o
-- valor novo, por isso tem de ser um ficheiro à parte.

-- Convite com prazo ("Convidado temporário"): expira sozinho sem precisar de
-- tarefa agendada — é verificado em cada função de acesso, não apagado por
-- um cron. NULL = sem prazo (o caso normal, para todos os papéis existentes).
alter table public.organization_members add column if not exists expires_at timestamptz;

create table if not exists public.role_resource_permissions (
  role member_role not null,
  resource text not null,
  can_view boolean not null default false,
  can_write boolean not null default false,
  primary key (role, resource)
);
alter table public.role_resource_permissions enable row level security;
-- Leitura por qualquer autenticado (não expõe nada sensível — é só a matriz
-- de configuração, não dados de nenhuma organização) para a UI poder
-- explicar "o que cada permissão dá" sem precisar de uma RPC dedicada.
create policy "role_resource_permissions_select" on public.role_resource_permissions
  for select to authenticated using (true);
-- Escrita nenhuma pela API — a matriz é gerida por migração, não pela app,
-- para uma alteração de âmbito de um papel ficar sempre registada e revista.

-- Recursos: 'loans' (empréstimos/adiantamentos a funcionários) é distinto de
-- 'obligations_receivable' apesar de ambos terem direction='receivable' na
-- tabela — são conceptualmente diferentes (dívida de cliente vs. dívida de
-- funcionário) e o RH não deve ver as dívidas dos clientes só por gerir
-- empréstimos. Confirmado em grant_employee_loan: direction é sempre
-- 'receivable' para os dois tipos de empréstimo.
--
-- Seed dos 5 papéis EXISTENTES preserva o comportamento atual ao milímetro:
-- veem tudo (como hoje, sem exceção), escrevem o que já escreviam
-- (user_writable_org_ids continua a decidir isso em paralelo — esta matriz
-- só passa a ADICIONAR-SE à leitura das tabelas already-open; não retira
-- nada a ninguém que já tinha acesso).
insert into public.role_resource_permissions (role, resource, can_view, can_write)
select r::member_role, res, true, (r in ('owner','admin','finance'))
from unnest(array['owner','admin','member','finance','viewer']) as r
cross join unnest(array['accounts','ledger','obligations_receivable','obligations_payable','loans','reserves','recurring','bank_reconciliation','requisitions','contacts','audit_log']) as res
on conflict (role, resource) do nothing;
-- viewer/member nunca escrevem, mesmo com a regra acima (owner/admin/finance
-- só) — já correto porque 'viewer' e 'member' não estão nessa lista.

-- Papéis novos, âmbito estreito por desenho — cada um só vê o que precisa
-- para o que lhe foi pedido, o resto fica a false por omissão da tabela.
insert into public.role_resource_permissions (role, resource, can_view, can_write) values
  ('requisitante', 'requisitions', true, true),
  ('requisitante', 'contacts', true, false),

  ('cobrador', 'obligations_receivable', true, true),
  ('cobrador', 'contacts', true, false),

  ('pagador', 'obligations_payable', true, true),
  ('pagador', 'contacts', true, false),

  -- Contabilista: lê tudo o que é financeiro para fechar contas e exportar,
  -- mas não o registo de auditoria (não precisa de saber QUEM alterou o
  -- quê, só os números) e nunca escreve.
  ('contabilista', 'accounts', true, false),
  ('contabilista', 'ledger', true, false),
  ('contabilista', 'obligations_receivable', true, false),
  ('contabilista', 'obligations_payable', true, false),
  ('contabilista', 'loans', true, false),
  ('contabilista', 'reserves', true, false),
  ('contabilista', 'recurring', true, false),
  ('contabilista', 'bank_reconciliation', true, false),
  ('contabilista', 'requisitions', true, false),
  ('contabilista', 'contacts', true, false),

  -- Operador de caixa: vê contas e lança movimentos. NOTA HONESTA — nesta
  -- fase ainda não restringe a UMA conta específica (isso precisa de uma
  -- tabela de atribuição conta↔pessoa, mecanismo diferente deste); por
  -- agora vê e lança em TODAS as contas, só sem relatórios/dívidas/reservas.
  ('caixa', 'accounts', true, false),
  ('caixa', 'ledger', true, true),

  -- Aprovador: só decide (aprova/rejeita), nunca desembolsa — a separação
  -- entre aprovar e desembolsar já existe desde a Fase 1 dos empréstimos
  -- (approve_requisition vs disburse_requisition), por isso este papel é
  -- só mais uma consequência dessa separação, não trabalho novo.
  ('aprovador', 'requisitions', true, true),

  -- RH: gere empréstimos/adiantamentos a funcionários, não vendas nem
  -- dívidas de clientes/fornecedores.
  ('rh', 'contacts', true, false),
  ('rh', 'loans', true, true),

  -- Auditor: leitura total, incluindo o registo de auditoria (é a diferença
  -- para o contabilista) — nunca escreve nada.
  ('auditor', 'accounts', true, false),
  ('auditor', 'ledger', true, false),
  ('auditor', 'obligations_receivable', true, false),
  ('auditor', 'obligations_payable', true, false),
  ('auditor', 'loans', true, false),
  ('auditor', 'reserves', true, false),
  ('auditor', 'recurring', true, false),
  ('auditor', 'bank_reconciliation', true, false),
  ('auditor', 'requisitions', true, false),
  ('auditor', 'contacts', true, false),
  ('auditor', 'audit_log', true, false)

  -- 'convidado_temp' fica sem nenhuma linha: começa sem ver nada, até o
  -- administrador decidir dar-lhe acesso a algo específico (fora desta
  -- migração — é ajuste caso a caso, não um perfil fixo).
on conflict (role, resource) do nothing;

create or replace function public.user_can_view(p_org_id uuid, p_resource text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select rp.can_view
     from public.organization_members om
     join public.role_resource_permissions rp on rp.role = om.role and rp.resource = p_resource
     where om.organization_id = p_org_id and om.user_id = auth.uid()
       and (om.expires_at is null or om.expires_at > now())),
    false
  );
$$;

create or replace function public.user_can_write(p_org_id uuid, p_resource text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select rp.can_write
     from public.organization_members om
     join public.role_resource_permissions rp on rp.role = om.role and rp.resource = p_resource
     where om.organization_id = p_org_id and om.user_id = auth.uid()
       and (om.expires_at is null or om.expires_at > now())),
    false
  );
$$;
revoke all on function public.user_can_view(uuid, text) from public, anon;
revoke all on function public.user_can_write(uuid, text) from public, anon;
grant execute on function public.user_can_view(uuid, text) to authenticated;
grant execute on function public.user_can_write(uuid, text) to authenticated;

-- Convites com prazo aplicam-se a TODA a gente, não só a quem tem
-- 'convidado_temp' — a expiração passa a ser respeitada nas 3 funções que já
-- decidem leitura/escrita/administração, para um acesso vencido deixar de
-- valer em todo o lado de uma só vez, não só nos recursos da matriz nova.
create or replace function public.user_org_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select organization_id from public.organization_members
  where user_id = auth.uid() and (expires_at is null or expires_at > now());
$$;

create or replace function public.user_writable_org_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select om.organization_id
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = auth.uid()
    and om.role in ('owner', 'admin', 'finance')
    and not o.is_archived
    and (om.expires_at is null or om.expires_at > now());
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
    and not o.is_archived
    and (om.expires_at is null or om.expires_at > now());
$$;

-- VERIFICADO ao vivo antes de escrever este ficheiro (org de teste, Test Org
-- F): user_org_ids() sem regressão para o owner real; user_can_view/
-- user_can_write corretos para owner (true/true em 'accounts') e para um
-- não-membro (false); um membro com expires_at no passado fica
-- imediatamente excluído de user_org_ids() e reposto a null no fim do
-- teste; tentativa de alterar organization_members sem auth.uid() válido
-- (ligação sem claims) foi corretamente rejeitada pelo trigger
-- prevent_role_escalation, confirmando que nem uma ligação privilegiada
-- contorna essa proteção. Saldo de uma organização real (CHEAR INVESTIMENT)
-- confirmado intacto depois da migração.
