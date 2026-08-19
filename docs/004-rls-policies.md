# Políticas RLS — ZeroMaka

Projeto Supabase: `zeromaka` (`ouhvwbwdfagkdewjhuyt`, eu-west-3)

## Papéis

| Papel | Descrição | Leitura | Escrita dados | Gerir membros |
|-------|-----------|---------|---------------|---------------|
| `owner` | Dono da organização | Sim | Sim | Sim |
| `admin` | Administrador | Sim | Sim | Sim |
| `finance` | Gestor financeiro | Sim | Sim | Nao |
| `viewer` | Apenas consulta | Sim | Nao | Nao |

## Funções auxiliares (security definer)

| Função | Retorno | Descrição |
|--------|---------|-----------|
| `user_org_ids()` | `setof uuid` | IDs de orgs onde o utilizador é membro (qualquer papel) |
| `user_writable_org_ids()` | `setof uuid` | IDs de orgs onde o utilizador tem papel owner, admin ou finance |
| `user_admin_org_ids()` | `setof uuid` | IDs de orgs onde o utilizador tem papel owner ou admin |

Todas são `security definer` com `search_path = ''` — executam como o dono da função (postgres), ignorando RLS, para evitar recursão.

## Políticas por tabela

### organizations
| Operação | Política | Condição |
|----------|----------|----------|
| SELECT | Members can view their orgs | `id IN (SELECT user_org_ids())` |
| INSERT | Authenticated users can create orgs | `auth.uid() IS NOT NULL` |

### profiles
| Operação | Política | Condição |
|----------|----------|----------|
| SELECT | Users can view own profile | `auth.uid() = id` |
| UPDATE | Users can update own profile | `auth.uid() = id` |

### organization_members
| Operação | Política | Condição |
|----------|----------|----------|
| SELECT | Members can view org members | `user_id = auth.uid() OR organization_id IN (SELECT user_org_ids())` |
| INSERT | Admins can add members | `user_id = auth.uid() OR organization_id IN (SELECT user_admin_org_ids())` |
| UPDATE | Admins can update members | `organization_id IN (SELECT user_admin_org_ids())` |
| DELETE | Admins can delete members | `organization_id IN (SELECT user_admin_org_ids()) AND user_id != auth.uid()` |

Trigger `prevent_role_escalation` impede:
- Atribuir papel superior ao do actor
- Auto-elevação de papel
- Remover o último owner

### companies
| Operação | Política | Condição |
|----------|----------|----------|
| SELECT | Members can view company | `organization_id IN (SELECT user_org_ids())` |
| INSERT | Members can insert company | `organization_id IN (SELECT user_org_ids())` |
| UPDATE | Admins can update company | `organization_id IN (SELECT user_admin_org_ids())` |

### accounts, contacts, transactions, invoices, requisitions
| Operação | Política | Condição |
|----------|----------|----------|
| SELECT | Members can view | `organization_id IN (SELECT user_org_ids())` |
| INSERT | Writers can insert | `organization_id IN (SELECT user_writable_org_ids())` |
| UPDATE | Writers can update | `organization_id IN (SELECT user_writable_org_ids())` |
| DELETE | Writers can delete | `organization_id IN (SELECT user_writable_org_ids())` |

### audit_logs
| Operação | Política | Condição |
|----------|----------|----------|
| SELECT | Members can view audit logs | `organization_id IN (SELECT user_org_ids())` |

Sem INSERT/UPDATE/DELETE para utilizadores — apenas triggers inserem.

## Triggers de auditoria

| Tabela | Trigger | Função |
|--------|---------|--------|
| accounts | `trg_audit_accounts` | `audit_financial_change()` |
| contacts | `trg_audit_contacts` | `audit_financial_change()` |
| transactions | `trg_audit_transactions` | `audit_financial_change()` |
| invoices | `trg_audit_invoices` | `audit_financial_change()` |
| requisitions | `trg_audit_requisitions` | `audit_financial_change()` |
| companies | `trg_audit_companies` | `audit_financial_change()` |
| organization_members | `trg_audit_org_members` | `audit_financial_change()` |
| organizations | `trg_audit_organizations` | `audit_org_change()` |

## Atualização 2026-08-19 — 9 papéis estreitos e permissões por ação

O resto deste documento descreve o estado inicial (4 papéis: owner/admin/
finance/viewer, tabelas `transactions`/`invoices` já substituídas pelo
razão de `journal_entries`/`journal_lines` — ver `docs/005-financial-engine.md`).
**Não foi reescrito** — só esta secção documenta o que mudou na evolução
de permissões desta data; o resto do ficheiro está desatualizado e não
deve ser tratado como descrição do estado atual.

`member_role` tem hoje 14 valores: os 5 originais (owner, admin, member,
finance, viewer) + 9 de âmbito estreito (requisitante, cobrador, pagador,
contabilista, caixa, aprovador, rh, auditor, convidado_temp).

Duas tabelas de permissão, camadas independentes:

- **`role_resource_permissions(role, resource, can_view, can_write)`** —
  bit grosso por recurso (accounts, ledger, obligations_receivable,
  obligations_payable, loans, reserves, recurring, bank_reconciliation,
  requisitions, contacts, audit_log). Funções `user_can_view()`/
  `user_can_write()`.
- **`role_action_permissions(role, resource, action, allowed)`** — bits
  finos por ação (create_draft, edit_own_draft, approve, reject,
  disburse, receive, settle, reverse, export, view_audit). Função
  `user_can_do()`. Existe porque um único `can_write` partilhado entre
  "criar" e "decidir" no mesmo recurso já causou um bug real de
  autoaprovação em `requisitions` — ver `20260819_0072`/`0074`.

`requisitions` deixou de aceitar `INSERT`/`UPDATE`/`DELETE` direto de
`authenticated` (era a única tabela financeira ainda nesse estado) — toda
a escrita passa por `create_requisition`/`update_requisition_draft`/
`delete_requisition_draft`/`approve_requisition`/`reject_requisition`/
`disburse_requisition`.

Nova tabela `account_assignments(organization_id, user_id, account_id)` —
lista de permissão (falha fechada) que limita `caixa` às contas
explicitamente atribuídas via `assign_account`/`unassign_account`
(só admin). Owner/admin/finance e `rh` (via `grant_employee_loan`) não
são afetados.

Ver `supabase/migrations/20260819_0072` a `0079` para o SQL completo, e
`supabase/tests/phase10` a `phase16` para os testes ao vivo.

## Testes RLS executados

1. Utilizador A não vê contas da Org B
2. Utilizador A vê as suas próprias contas
3. Utilizador A não vê contactos da Org B
4. Utilizador A não vê empresa da Org B
5. Utilizador A não vê Org B na lista de organizações
6. Utilizador B não vê dados da Org A
7. Viewer pode ler contas
8. Viewer não pode inserir contas
9. Viewer não pode atualizar contas
10. Finance pode inserir e apagar contas
11. Utilizador não autenticado vê 0 contas
12. Utilizador não autenticado vê 0 organizações

Todos os testes executados via SQL contra a base de dados (não apenas frontend).
