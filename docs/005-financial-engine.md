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
| `create_account_with_balance` | Cria conta + opening_balance entry (escreve também `accounts.initial_balance` — [coluna legada](#accountsinitial_balance--coluna-legada)) |
| `mark_invoice_paid` | Liquida fatura + cria income/expense entry |
| `approve_requisition` | Aprova requisição + cria expense entry |
| `seed_default_categories` | Popula categorias padrão angolanas |
| `next_entry_number` | SECURITY DEFINER — sequência atómica |

## Convenção débito/crédito

- **Débito** = dinheiro ENTRA na conta (receita, saldo inicial, transferência recebida, reversão de despesa)
- **Crédito** = dinheiro SAI da conta (despesa, transferência enviada, reversão de receita)
- Saldo atual da conta (desde 2026-08-05, `20260805_0029_saldo_data_base.sql`): `current_account_balance(account_id)` —
  valor do `opening_balance` **posted** mais recente da conta, mais `SUM(debit) - SUM(credit)` só dos
  movimentos com data entre essa data-base e hoje. Movimentos anteriores à data-base ficam no histórico e
  nos relatórios, mas não voltam a alterar o saldo atual (já estão implícitos no valor de abertura); movimentos
  futuros também ficam de fora. Sem nenhum `opening_balance`, soma tudo (comportamento anterior, sem corte).
  Espelhado no frontend por `computeAccountBalance()` em `lib/accounts/balance.ts`, usado no `useMemo` de
  `accounts` em `lib/store.tsx`. `get_true_available_cash` usa a mesma função para o saldo bruto das contas.
  `get_account_balances(org_id)` (mais antigo, não chamado pelo frontend) continua a somar tudo sem data-base —
  não a usar para saldo "atual" de uma conta com abertura configurada.

## `accounts.initial_balance` — coluna legada

> **Não ler esta coluna para calcular, validar ou apresentar qualquer saldo.**

`create_account_with_balance` grava o saldo de abertura em **dois** sítios:

1. uma entrada `journal_entries` do tipo `opening_balance` (débito na conta) — **fonte de verdade**;
2. a coluna `accounts.initial_balance` — **cópia redundante**.

Nenhum cálculo de saldo lê a coluna. `get_account_balances(p_org_id)` deriva tudo de
`journal_lines`/`journal_entries`, e o `useMemo` de `accounts` em `lib/store.tsx` faz o
mesmo no cliente. A coluna sobrevive apenas como rótulo visual.

Isto é uma tensão conhecida com a regra do charter *"o saldo da conta não é fonte
independente — deriva das movimentações"* (`docs/000-charter.md`). Não há duplicação no
saldo apresentado hoje, mas o dado é redundante e induz em erro. Mantém-se por
compatibilidade, **não por correção**.

### Quem depende dela hoje

| Local | Uso |
|-------|-----|
| `lib/store.tsx` (`dbToAccount`) | lê `initial_balance` → `Account.initialBalance` |
| `lib/store.tsx` (`addAccount`) | envia `p_initial_balance` para o RPC (escrita) |
| `app/app/contas/page.tsx` | mostra o rótulo `Inicial: …` no cartão da conta |
| `lib/data.ts` (`Account`) | campo obrigatório do tipo + dados de demonstração |
| `supabase/tests/phase{3,4,5}_*.test.sql` | `insert into accounts (…, initial_balance)` |

Ou seja: **a coluna não pode ser simplesmente removida** — há leitores. E o `DROP COLUMN`
partiria também `create_account_with_balance` (que a escreve) e, por arrasto, o
onboarding, que a invoca em `20260803_0027_onboarding_state.sql`.

### Regras para código novo

- Para o saldo de uma conta: somar `journal_lines` (débito − crédito) ou usar
  `get_account_balances`. Nunca `initial_balance`.
- Para o saldo de abertura: ler a entrada `opening_balance` da conta.
- Nunca somar `initial_balance` a um saldo derivado — duplicaria o valor.
- Nunca fazer `UPDATE accounts SET initial_balance` para corrigir um saldo: a correção
  faz-se por lançamento de ajuste (`adjustment`), preservando auditoria.

### Plano de remoção (fase futura, não executada)

Requer fase própria com aprovação, porque toca no RPC de criação de contas:

1. Trocar o rótulo `Inicial` em `app/app/contas/page.tsx` pelo valor derivado da entrada
   `opening_balance` (o `journalEntries` do store já o tem em memória).
2. Remover `initialBalance` de `Account` (`lib/data.ts`) e do mapper `dbToAccount`.
3. Recriar `create_account_with_balance` sem a escrita na coluna, mantendo o parâmetro
   `p_initial_balance` (que continua a alimentar a entrada `opening_balance`).
4. Actualizar os três ficheiros de teste SQL.
5. Só então: `alter table public.accounts drop column initial_balance;`
6. Validar que os saldos por conta não mudam antes/depois (ver query em
   `docs/005` § *Verificação*).

### Verificação

Query que confirma que a coluna é redundante — deve devolver **zero linhas**:

```sql
select a.id, a.name, a.initial_balance, coalesce(ob.opening, 0) as opening_entry
from public.accounts a
left join (
  select l.account_id,
         sum(case when l.direction = 'debit' then l.amount else -l.amount end) as opening
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  where e.entry_type = 'opening_balance'
  group by l.account_id
) ob on ob.account_id = a.id
where a.initial_balance is distinct from coalesce(ob.opening, 0);
```

E que o saldo derivado não depende dela — comparar antes/depois de qualquer alteração:

```sql
select account_id, balance from public.get_account_balances('<org_id>') order by account_id;
```

> **Estado:** as duas queries acima ainda **não** foram executadas contra o projecto
> `ouhvwbwdfagkdewjhuyt`. O repositório só contém a chave publishable (anon), sujeita a
> RLS e sem sessão de utilizador; não há `service_role`, `psql` nem Supabase CLI
> disponíveis. Executar no SQL Editor do Supabase antes de avançar com a remoção.

## Reversão

A reversão NÃO exclui a entrada original do cálculo de saldo. Em vez disso:
1. A entrada original é marcada `status = 'reversed'`
2. Um novo lançamento `entry_type = 'reversal'` é criado com linhas opostas
3. O saldo inclui ambos — original e reversão anulam-se mutuamente

Isto garante que o histórico completo fica preservado e auditável.

Com a data-base (secção acima), `current_account_balance`/`computeAccountBalance` avaliam a
reversão pela data do lançamento que ela reverte, nunca pela sua própria data (que é sempre
"hoje"). Sem isto, reverter um movimento anterior à data-base — que já não contava para o
saldo — criaria um movimento fantasma (a reversão entraria sozinha, sem o original para se
anular). Os dois ficam sempre do mesmo lado do corte de data.

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
