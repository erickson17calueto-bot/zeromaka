# Fluxo de requisições (incluindo empréstimos/adiantamentos)

## Tipos de requisição

`requisitions.type` (`requisition_type`): `expense` (default — preserva todas as requisições antigas), `purchase`, `employee_loan`, `salary_advance`, `operational_advance`, `other`.

Campos só relevantes para os tipos de empréstimo: `beneficiary_contact_id`, `due_date`, `installments`, `recovery_method` (`direct_payment` | `salary_deduction` | `mixed`).

## Estados

`req_status`: `pendente` → `aprovado` | `reprovado`, mais dois estados novos desde a Fase 1: `aguardando_desembolso` (aprovada, dinheiro ainda não saiu) e `desembolsada` (dinheiro já saiu, usado para requisições de tipo empréstimo/adiantamento).

Requisições normais (`type = expense`) continuam a poder aprovar+desembolsar no mesmo passo, terminando em `aprovado` — **comportamento idêntico ao de antes desta fase**, sem quebra.

## RPCs

- `approve_requisition(p_req_id, p_account_id, p_org_id, p_disburse = true)` — `p_disburse` é opcional e por omissão `true`: chamadas antigas (sem o parâmetro) continuam a aprovar+desembolsar exatamente como sempre fizeram. Com `p_disburse = false`, só muda o estado para `aguardando_desembolso`, sem tocar no caixa.
- `disburse_requisition(p_req_id, p_account_id, p_org_id)` — desembolsa uma requisição já em `aguardando_desembolso`. Para tipos de empréstimo, reusa `grant_employee_loan()` internamente; para os restantes, posta a despesa da mesma forma que `approve_requisition` sempre fez.
- Ambas são `SECURITY DEFINER` com `search_path` fixo (antes desta fase, `approve_requisition` corria com o privilégio do chamador — inconsistente com o resto do sistema financeiro).

## Duplo-clique / concorrência

`select ... for update` na requisição serializa tentativas concorrentes: a segunda chamada só prossegue depois da primeira confirmar, e nessa altura o estado já não é `pendente`/`aguardando_desembolso`, pelo que falha com um erro claro em vez de desembolsar duas vezes.

## Ligação a obrigações

`financial_obligations.source_requisition_id` (FK, índice único) liga uma obrigação à requisição de origem — nunca só por `metadata` JSON. Cobre tanto requisições de empréstimo criadas diretamente como requisições antigas reclassificadas (ver [LOAN-MIGRATION.md](./LOAN-MIGRATION.md)).

## Interface

- Formulário de nova requisição: seletor de tipo; campos de empréstimo aparecem só quando o tipo exige.
- Aprovação: mostra saldo da conta antes/depois de desembolsar; dois botões — "Aprovar e desembolsar" e "Aprovar apenas (desembolsa depois)".
- Requisições `aguardando_desembolso` mostram um botão "Desembolsar" próprio.
