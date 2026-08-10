# Contabilização de empréstimos e adiantamentos

## Fonte oficial da dívida

Um empréstimo ou adiantamento a funcionário nunca é representado só por uma requisição ou uma transação genérica. A fonte oficial é sempre uma `financial_obligations` (`direction = 'receivable'`, `document_kind = 'employee_loan'` ou `'salary_advance'`).

- **Requisição** = pedido e aprovação (opcional — um empréstimo pode nascer diretamente em `/app/emprestimos`, sem passar por requisição nenhuma).
- **Empréstimo/adiantamento** (`financial_obligations`) = a dívida oficial do funcionário à empresa.
- **Lançamento financeiro** (`journal_entries`) = a saída ou entrada real de dinheiro.
- **Liquidação** (`settlements`/`settlement_allocations`) = a devolução, parcial ou total.

## Tipos de lançamento não-operacionais

Desde a Fase 1, o enum `journal_entry_type` tem 4 valores dedicados, fora de `income`/`expense`:

| Tipo | Quando |
|---|---|
| `loan_disbursement` | Dinheiro sai na concessão de um empréstimo |
| `salary_advance_disbursement` | Dinheiro sai na concessão de um adiantamento salarial |
| `loan_repayment` | Dinheiro entra na devolução de um empréstimo |
| `salary_advance_repayment` | Dinheiro entra na devolução de um adiantamento |

**Por que não `income`/`expense`:** um empréstimo concedido não é uma despesa operacional — é troca de ativo (caixa por um valor a receber do funcionário). A devolução não é receita — é a troca inversa. Usar tipos próprios significa que a DRE (`report_income_cash`, que só soma `entry_type in ('income','expense')`) já os exclui automaticamente, sem nenhum código extra.

## DRE e DFC

- **DRE** (`report_income_cash`): exclui empréstimos/adiantamentos por construção (não estão em `('income','expense')`).
- **DFC** (`report_cash_flow`): tem uma secção própria "Empréstimos e adiantamentos" (concedido/recuperado), no mesmo padrão já usado para capital de sócios (`Atividades de financiamento`). O saldo de caixa final continua a refletir estes movimentos — só não ficam misturados com operacional.

## "Disponível de verdade"

O desembolso reduz o caixa na hora (`current_account_balance()` soma todos os `entry_type` exceto `opening_balance`, incluindo os 4 novos). O saldo a receber do funcionário **não** é caixa disponível — é só reportado nos indicadores de `/app/emprestimos` e no relatório de posição.

## Limitação documentada: desconto salarial

O schema já suporta `installments`/`recovery_method` (`salary_deduction` incluído) em `requisitions`, mas **não existe motor de folha salarial** nesta versão do ZeroMaka — não há como confirmar automaticamente que um desconto foi aplicado numa folha que não existe no sistema. Uma parcela por desconto salarial só é considerada liquidada quando alguém regista manualmente a devolução (via `/app/emprestimos` → "Registar devolução"), tal como qualquer outra. Construir um motor de folha completo fica fora de escopo desta fase — é referido explicitamente no master prompt original como "preparar o modelo", não implementar a folha.
