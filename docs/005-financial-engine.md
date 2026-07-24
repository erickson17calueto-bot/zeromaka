# 005 — Motor Financeiro (Diário de Lançamentos)

Fase 2 da migração SaaS. Substitui a tabela `transactions` por um sistema de partidas dobradas baseado em `journal_entries` + `journal_lines`.

## Princípios

1. **Saldo = soma de journal_lines** — débito aumenta, crédito diminui. Nunca armazenado como campo independente.
2. **Sem eliminação** — movimentos confirmados são revertidos (contra-lançamento), nunca apagados.
3. **Numeração sequencial** — `next_entry_number` (SECURITY DEFINER) gera `MOV-YYYY-NNNNNN` sem gaps por organização.
4. **Idempotência** — UNIQUE em `(organization_id, idempotency_key)` previne duplicados.
5. **Atomicidade** — cada RPC cria entrada + linhas + sequência numa transação SQL.

## Tabelas

| Tabela | Função |
|--------|--------|
| `journal_entries` | Cabeçalho: tipo, data, descrição, status, metadata JSON |
| `journal_lines` | Linhas: account_id, direction (debit/credit), amount numeric(20,2) |
| `financial_categories` | Categorias receita/despesa, seed por RPC |
| `journal_entry_sequences` | Controlo de sequência por org+ano |

## RPCs (SECURITY INVOKER)

| RPC | Função |
|-----|--------|
| `post_income` | Receita: debit na conta, 1 linha |
| `post_expense` | Despesa: credit na conta, 1 linha |
| `post_transfer` | Transferência: credit origem + debit destino, 2 linhas |
| `reverse_journal_entry` | Marca original como reversed, cria contra-lançamento |
| `create_account_with_balance` | Cria conta + opening_balance entry |
| `mark_invoice_paid` | Liquida fatura + cria income/expense entry |
| `approve_requisition` | Aprova requisição + cria expense entry |
| `seed_default_categories` | Popula categorias padrão angolanas |
| `next_entry_number` | SECURITY DEFINER — sequência atómica |

## Convenção débito/crédito

- **Débito** = dinheiro ENTRA na conta (receita, saldo inicial, transferência recebida, reversão de despesa)
- **Crédito** = dinheiro SAI da conta (despesa, transferência enviada, reversão de receita)
- Saldo da conta = `SUM(debit) - SUM(credit)` de TODAS as linhas (incluindo entradas revertidas)

## Reversão

A reversão NÃO exclui a entrada original do cálculo de saldo. Em vez disso:
1. A entrada original é marcada `status = 'reversed'`
2. Um novo lançamento `entry_type = 'reversal'` é criado com linhas opostas
3. O saldo inclui ambos — original e reversão anulam-se mutuamente

Isto garante que o histórico completo fica preservado e auditável.

## Compatibilidade retroativa

O store (`lib/store.tsx`) expõe `transactions: Transaction[]` derivado de `journalEntries` via `entryToTransactions()`. Páginas não reescritas (dashboard, capital, faturas) usam esta interface sem alterações.

Regras de mapeamento:
- Entradas revertidas/reversal/opening_balance → excluídas de `transactions`
- Transferência → par `transfer_out` + `transfer_in`
- Capital → `capital_in` / `capital_out` via `metadata.type`

## Categorias

Semeadas por `seed_default_categories` no onboarding:
- **Receita**: Comissões, Juros, Outros recebimentos, Prestação de serviços, Vendas de mercadoria
- **Despesa**: Alimentação, Combustível, Fornecedores, Impostos, Manutenção, Outras despesas, Renda, Salários, Telecomunicações, Transporte

## Testes manuais validados

| # | Cenário | Resultado |
|---|---------|-----------|
| 1 | Criar conta BAI com saldo inicial 1M | opening_balance debit 1M, saldo = 1M |
| 2 | Criar conta Caixa com saldo inicial 100K | opening_balance debit 100K, saldo = 100K |
| 3 | Receita 250K na BAI | income debit 250K, saldo BAI = 1.25M |
| 4 | Despesa 80K na Caixa | expense credit 80K, saldo Caixa = 20K |
| 5 | Transferência BAI→Caixa 50K | credit BAI + debit Caixa, saldos atualizados |
| 6 | Reverter despesa 80K | contra-lançamento debit 80K, saldo Caixa = 150K |
| 7 | Dashboard mostra saldos corretos | 1.35M total, receitas 250K, despesas 0 |
| 8 | Entrada revertida mostra "Revertido" | label visual + sem botão reverter |
| 9 | Numeração sequencial MOV-2026-000001..6 | sem gaps |
| 10 | Categorias do DB no formulário | dropdown com categorias semeadas |
