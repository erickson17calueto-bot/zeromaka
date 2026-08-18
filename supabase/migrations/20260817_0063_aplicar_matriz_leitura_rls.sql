-- Aplica a matriz de permissões (20260817_0062) às políticas de SELECT das
-- tabelas financeiras. Até aqui a matriz existia mas não tinha efeito
-- nenhum — todas as políticas continuavam a ser só "organization_id in
-- (select user_org_ids())". Este ficheiro é o que de facto esconde dados
-- por papel.
--
-- Cada política mantém a condição de pertença à organização (sem isso, uma
-- falha na matriz abriria a organização toda) e ACRESCENTA a verificação de
-- recurso — nunca substitui, sempre "E também".

-- Contas
drop policy if exists "Members can view accounts" on public.accounts;
create policy "Members can view accounts" on public.accounts for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'accounts'));

-- Razão (lançamentos e linhas)
drop policy if exists "Members can view entries" on public.journal_entries;
create policy "Members can view entries" on public.journal_entries for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'ledger'));

drop policy if exists "Members can view lines" on public.journal_lines;
create policy "Members can view lines" on public.journal_lines for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'ledger'));

-- Obrigações (a receber/a pagar/empréstimos) — 'loans' é separado de
-- 'obligations_receivable' mesmo os empréstimos usando direction='receivable'
-- na tabela (confirmado em grant_employee_loan): são dívida de funcionário,
-- não de cliente, e o RH não deve ver as dívidas dos clientes só por gerir
-- empréstimos.
drop policy if exists "sel_obligations" on public.financial_obligations;
create policy "sel_obligations" on public.financial_obligations for select
using (
  organization_id in (select user_org_ids())
  and (
    (document_kind in ('employee_loan','salary_advance') and user_can_view(organization_id, 'loans'))
    or (document_kind not in ('employee_loan','salary_advance') and direction = 'receivable' and user_can_view(organization_id, 'obligations_receivable'))
    or (document_kind not in ('employee_loan','salary_advance') and direction = 'payable' and user_can_view(organization_id, 'obligations_payable'))
  )
);

-- Pagamentos/recebimentos (settlements). SIMPLIFICAÇÃO DELIBERADA: gerido só
-- por direction (incoming/outgoing), sem distinguir devolução de empréstimo
-- de recebimento de cliente — settlements não tem document_kind próprio, só
-- por junção a financial_obligations via settlement_allocations, o que
-- tornaria a política num subquery bem mais pesado. Consequência aceite: o
-- RH vê o valor em aberto de um empréstimo (via financial_obligations/
-- obligation_status, já correto), mas não a lista de devoluções individuais
-- em Pagamentos. Registado aqui para não passar como esquecimento.
drop policy if exists "sel_settlements" on public.settlements;
create policy "sel_settlements" on public.settlements for select
using (
  organization_id in (select user_org_ids())
  and (
    (direction = 'incoming' and user_can_view(organization_id, 'obligations_receivable'))
    or (direction = 'outgoing' and user_can_view(organization_id, 'obligations_payable'))
  )
);

drop policy if exists "sel_allocations" on public.settlement_allocations;
create policy "sel_allocations" on public.settlement_allocations for select
using (
  organization_id in (select user_org_ids())
  and exists (
    select 1 from settlements s where s.id = settlement_allocations.settlement_id
      and (
        (s.direction = 'incoming' and user_can_view(settlement_allocations.organization_id, 'obligations_receivable'))
        or (s.direction = 'outgoing' and user_can_view(settlement_allocations.organization_id, 'obligations_payable'))
      )
  )
);

-- Reservas financeiras
drop policy if exists "sel_reserves" on public.financial_reserves;
create policy "sel_reserves" on public.financial_reserves for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'reserves'));

-- Recorrências
drop policy if exists "recurring_transactions_select" on public.recurring_transactions;
create policy "recurring_transactions_select" on public.recurring_transactions for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'recurring'));

-- Reconciliação bancária
drop policy if exists "bank_statement_lines_select" on public.bank_statement_lines;
create policy "bank_statement_lines_select" on public.bank_statement_lines for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'bank_reconciliation'));

-- Requisições de fundos
drop policy if exists "Members can view requisitions" on public.requisitions;
create policy "Members can view requisitions" on public.requisitions for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'requisitions'));

-- Contactos — visível a quase todos os papéis novos (é diretório, não é em
-- si informação financeira), só 'convidado_temp' fica de fora por omissão.
drop policy if exists "Members can view contacts" on public.contacts;
create policy "Members can view contacts" on public.contacts for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'contacts'));

-- Registo de auditoria
drop policy if exists "Members can view audit logs" on public.audit_logs;
create policy "Members can view audit logs" on public.audit_logs for select
using (organization_id in (select user_org_ids()) and user_can_view(organization_id, 'audit_log'));

-- VERIFICADO ao vivo antes de escrever este ficheiro (org de teste, Test Org
-- F, papel do membro de teste reposto no fim): 24/24 verificações passaram.
-- Sem regressão nenhuma para o owner em nenhuma das 7 tabelas/vista tocadas
-- (accounts, journal_entries, requisitions, financial_obligations,
-- contacts, audit_logs, obligation_status). Requisitante vê requisitions e
-- contacts, não vê accounts/journal_entries/financial_obligations/
-- obligation_status/audit_logs/financial_reserves. RH vê os 3 empréstimos e
-- contacts, não vê requisitions/accounts/journal_entries. Contabilista vê
-- accounts/journal_entries/financial_obligations mas não audit_logs.
