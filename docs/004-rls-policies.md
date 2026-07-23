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
