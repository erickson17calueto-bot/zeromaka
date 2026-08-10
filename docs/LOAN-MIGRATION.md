# Recuperação de registos antigos

Cobre empréstimos/adiantamentos que já aconteceram antes desta funcionalidade existir, ou que foram lançados por engano como movimentos normais. **Nada é convertido automaticamente** — todas as três RPCs abaixo exigem confirmação humana explícita (funcionário, tipo) e nenhuma corre a partir de um trigger, cron ou heurística sozinha.

## `convert_entry_to_employee_loan(p_entry_id, p_org_id, p_contact_id, p_kind, p_due_date?, p_notes?)`

Um lançamento de despesa já existente (`entry_type = 'expense'`, `status = 'posted'`, ainda não ligado a nenhuma obrigação) passa a ser tratado como desembolso de empréstimo/adiantamento:

- **Não cria um novo movimento de caixa** — só reclassifica o `entry_type` do lançamento já existente (`expense` → `loan_disbursement`/`salary_advance_disbursement`).
- Cria a `financial_obligations`, ligada por `disbursement_entry_id`.
- Preserva valor, data, conta e histórico do lançamento original.
- Bloqueada para lançamentos revertidos (`status <> 'posted'`) e para lançamentos já ligados a outra obrigação.
- `journal_entries` já tem um trigger genérico de auditoria (`trg_audit_journal_entries`, `AFTER UPDATE`) — a reclassificação fica automaticamente registada em `audit_logs`, sem precisar de um registo manual duplicado.

Acessível em `/app/transacoes`, botão "Converter em empréstimo/adiantamento" em qualquer despesa elegível.

## `reclassify_requisition_as_loan(p_req_id, p_org_id, p_contact_id, p_kind, p_due_date?, p_installments?, p_recovery_method?, p_notes?)`

Mesma mecânica, para uma requisição antiga já `aprovado` (todas eram `type = expense` antes desta fase). Encontra o lançamento de despesa da requisição via `metadata->>'requisition_id'` (é assim que `approve_requisition` sempre marcou o lançamento), reusa a lógica de `convert_entry_to_employee_loan`, e adicionalmente:

- Liga `financial_obligations.source_requisition_id` à requisição.
- Atualiza `requisitions.type`, `beneficiary_contact_id`, `due_date`, `installments`, `recovery_method`.
- Bloqueada para requisições que não estejam `aprovado`, ou já ligadas a uma obrigação.

`/app/requisicoes` sugere candidatos automaticamente (requisições aprovadas, ainda sem obrigação ligada, cujo `purpose`/`category` menciona "empréstimo"/"adiantamento") — é só uma pista visual; a reclassificação em si continua a exigir escolher o funcionário e confirmar.

## `link_existing_repayment(p_entry_id, p_org_id, p_obligation_id)`

Uma receita já lançada (`entry_type = 'income'`, `status = 'posted'`, ainda não associada a nenhuma liquidação) passa a contar como devolução de um empréstimo:

- **Não cria uma nova entrada** — reclassifica o `entry_type` (`income` → `loan_repayment`/`salary_advance_repayment`) e cria a `settlements`/`settlement_allocations` apontando para o lançamento já existente.
- Valida que o valor não excede o saldo pendente da obrigação.
- Bloqueada para lançamentos já associados, revertidos, ou obrigações fechadas/de outro tipo.

## Prevenção de duplicados (resumo)

| Situação | Bloqueado por |
|---|---|
| Converter o mesmo lançamento duas vezes | verificação explícita + índice único em `disbursement_entry_id` |
| Reclassificar a mesma requisição duas vezes | verificação explícita + índice único em `source_requisition_id` |
| Associar o mesmo lançamento de devolução duas vezes | verificação explícita (`settlement_allocations.journal_entry_id`) |
| Desembolsar uma requisição já desembolsada | `status <> 'aguardando_desembolso'` |
| Aprovar uma requisição já decidida | `status <> 'pendente'` |

Testado ao vivo (10 cenários SQL, incluindo os 5 casos de rejeição acima) — ver histórico de commits desta fase.
