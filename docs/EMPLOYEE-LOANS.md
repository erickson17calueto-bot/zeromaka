# Empréstimos a funcionários

Ver primeiro [LOAN-ACCOUNTING.md](./LOAN-ACCOUNTING.md) para o modelo contabilístico (fonte oficial, tipos de lançamento, DRE/DFC).

## Como conceder

Duas origens possíveis, ambas terminam na mesma `financial_obligations` (`document_kind = 'employee_loan'`):

1. **Direto** — `/app/emprestimos` → "Novo empréstimo/adiantamento" → `grant_employee_loan()`. Desembolsa e cria a obrigação no mesmo passo.
2. **Via requisição** — `/app/requisicoes`, tipo "Empréstimo a funcionário". Pode "Aprovar apenas" (não mexe no caixa, fica `aguardando_desembolso`) ou "Aprovar e desembolsar" (tudo de uma vez, fica `desembolsada`). Internamente chama a mesma `grant_employee_loan()` e liga `financial_obligations.source_requisition_id` à requisição.

Só contactos com `kind = 'funcionario'` ou `'ambos'` podem ser beneficiários — validado em `grant_employee_loan()`, não só na interface.

## Como devolver

`/app/emprestimos` → ícone de carteira → "Registar devolução" → `postSettlement()` com `direction: 'incoming'`. Devoluções parciais ficam registadas como tal; o `outstanding_amount` (via a view `obligation_status`) desce automaticamente.

## Registos antigos

Se um empréstimo foi lançado por engano como despesa normal (antes desta funcionalidade existir, ou por erro de categorização):

- **Lançamento avulso**: `/app/transacoes`, botão "Converter em empréstimo/adiantamento" em qualquer despesa ainda não ligada a uma obrigação. Não cria uma nova saída — reclassifica o lançamento já existente.
- **Requisição antiga já aprovada**: `/app/requisicoes` mostra automaticamente candidatos (requisições aprovadas cujo texto menciona "empréstimo"/"adiantamento" e ainda não ligadas) numa secção própria, com botão "Reclassificar". Nunca acontece sozinho.
- **Devolução já lançada como receita normal**: usar `link_existing_repayment()` (via o mesmo fluxo de conversão) para associar sem duplicar a entrada.

Ver [LOAN-MIGRATION.md](./LOAN-MIGRATION.md) para detalhes técnicos destas três RPCs.

## Impedir duplicados

- Um lançamento só pode ser convertido/ligado uma vez — bloqueado por índice único (`disbursement_entry_id`) e por verificação explícita nas RPCs.
- Uma requisição só pode ser reclassificada uma vez — índice único em `source_requisition_id`.
- Desembolsar uma requisição já desembolsada, ou aprovar uma já não-pendente, falha com erro claro (nunca duplica silenciosamente).
