# 006 — Contas a receber, contas a pagar e cobranças (Fase 3)

Modelo unificado de obrigações financeiras + liquidações + cobranças, sobre o livro
de partidas dobradas da Fase 2. Substitui a antiga tabela `invoices`.

## Princípios

1. **Obrigação ≠ pagamento ≠ movimento de caixa ≠ cobrança** — quatro conceitos separados.
2. **Criar uma obrigação nunca altera o saldo.** O saldo só muda quando há liquidação.
3. **Saldo pendente é calculado**, nunca armazenado (view `obligation_status`).
4. **Atómico e idempotente** — `post_settlement` bloqueia as obrigações (FOR UPDATE),
   recalcula o pendente na transação, impede pagamento em excesso e cria os movimentos
   no livro numa só transação. `idempotency_key` único por organização.
5. **Reversão preserva o histórico** — liquidação marcada `reversed`, contra-lançamentos
   no livro, saldo pendente restaurado. Nada é apagado.
6. **Limite fiscal** — "fatura" = documento de controlo interno. Sem emissão certificada,
   QR fiscal, SAF-T, AGT, IVA definitivo ou numeração fiscal.

## Tabelas (numeric(20,2), organization_id, RLS)

| Tabela | Função |
|--------|--------|
| `financial_obligations` | Obrigação a receber/pagar. `lifecycle_status` open/cancelled. |
| `settlements` | Pagamento efetivo (incoming/outgoing). `status` posted/reversed. |
| `settlement_allocations` | Liga pagamento→obrigação; guarda o `journal_entry_id`. |
| `collection_interactions` | Registo de cobrança (canal, tipo, resultado, promessa). |
| `document_number_sequences` | Numeração REC-/PAG-/LIQ- por org+ano. |

## View `obligation_status` (security_invoker)

Devolve `paid_amount`, `outstanding_amount`, `days_overdue` e `financial_status`:
`cancelled` · `paid` · `partial` · `overdue` · `partial_overdue` · `due_today` · `open`.
Calculado a partir do valor original, das liquidações **posted** e da data — sem cron.

## RPCs (SECURITY DEFINER, verificam auth + permissão internamente)

| RPC | Função |
|-----|--------|
| `create_financial_obligation` | Cria obrigação (numeração REC/PAG). Não toca no saldo. |
| `post_settlement` | Liquidação atómica; um lançamento por alocação; anti-overpay. |
| `reverse_settlement` | Reverte a liquidação e os lançamentos; restaura o pendente. |
| `cancel_obligation` | Cancela obrigação sem pagamentos. |
| `update_obligation` | Edita; bloqueia reduzir abaixo do pago e trocar contacto após pagamento. |
| `next_document_number` | Sequência atómica por prefixo. |

## Integração com o livro (Fase 2)

- Recebimento (incoming) → `post_income` (debita a conta = entra dinheiro).
- Pagamento (outgoing) → `post_expense` (credita a conta = sai dinheiro).
- Um lançamento por alocação, ligado em `settlement_allocations.journal_entry_id`,
  com a categoria da obrigação quando o tipo corresponde. Metadata `{settlement_id,
  obligation_id, kind:'settlement'}`.

## Segurança (RLS + GRANTs)

- SELECT por membros da org (`user_org_ids()`); a view herda a RLS (security_invoker).
- **Sem** políticas de INSERT/UPDATE/DELETE em obligations/settlements/allocations →
  escrita direta pela API bloqueada; só as funções DEFINER escrevem.
- `collection_interactions`: INSERT direto por papéis com escrita (`user_writable_org_ids()`).
- **GRANTs mínimos**: os privilégios default do Postgres davam INSERT/UPDATE/DELETE a
  anon/authenticated — revogados; reconcedido apenas SELECT (e INSERT em interações)
  a `authenticated`. `anon` sem privilégios. `next_document_number` e as RPCs revogadas de anon.

## UI

- **A receber** / **A pagar** (`ObligationsView`): lista, criar, pagamento parcial/total,
  reverter, cancelar; filtros e totais (a receber, vencido, 7 dias).
- **Cobranças**: recebíveis vencidos priorizados (mais atraso → maior valor), antiguidade
  (1-7/8-30/31-60/+60), link `wa.me` com mensagem pré-preenchida (não envia), registo de
  interações e promessas, histórico por documento.
- **Dashboard**: a receber / vencido / a pagar / a pagar 7 dias, recebido/pago no mês,
  clientes em atraso, próximos vencimentos. Contas a receber **nunca** somadas ao saldo.

## Migração da tabela invoices

A tabela `invoices` nunca teve dados neste projeto (0 linhas). Removida com guarda de
segurança (aborta se houver linhas), junto com o RPC `mark_invoice_paid`. Toda a Uz de
faturas passou a `financial_obligations`.

## Testes

`supabase/tests/phase3_receivables_payables.test.sql` — 35 asserções via impersonação JWT
(2 orgs, papéis owner/viewer/finance), incluindo isolamento cross-org e RLS direta.
Resultado: **35/35 verdes**. Executar no SQL editor do Supabase ou via MCP; cria e limpa
fixtures isoladas (orgs `test-org-a/b`), não toca em dados reais.

### Cenário manual validado
BAI/Caixa; Hotel Horizonte 1.000.000 vencido há 5 dias → parcial 400.000 (`partial_overdue`,
pendente 600.000) → final 600.000 (`paid`, saldo +1.000.000) → reverter → pendente 600.000,
saldo −600.000, histórico preservado.
