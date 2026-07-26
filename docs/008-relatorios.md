# 008 — Relatórios

Como os relatórios são calculados, exportados e testados.

## Princípio central

**O cálculo é sempre do servidor.** As funções PostgreSQL são a única fonte de
verdade; o frontend nunca soma nem recalcula totais. O ecrã, o PDF e o Excel
consomem exatamente o mesmo resultado — se divergissem, um deles estaria a
mentir.

Todos os valores são `numeric` no Postgres (nunca float), pelo que não há erros
de arredondamento em cadeia.

## Relatórios disponíveis

| Relatório | Função | Forma |
|---|---|---|
| Demonstração de Resultado de Caixa | `report_income_cash` | secções/totais |
| Demonstração do Fluxo de Caixa | `report_cash_flow` | secções/totais |
| Controlo Fiscal (interno) | `report_tax_control` | secções/totais |
| Mapa de Antiguidade de Saldos | `report_aging` | secções/totais |
| Extrato de Conta | `report_account_ledger` | saldo corrido |
| Balanço (gestão) | — | calculado no cliente, assinalado como rascunho |

### Forma uniforme (secções/totais)

```jsonc
{
  "meta":     { "report", "title", "start", "end", "currency", "basis",
                "has_comparison", "cmp_start", "cmp_end", "warnings": [] },
  "sections": [ { "title", "lines": [ { "label", "key", "current",
                                        "comparison", "difference" } ],
                  "subtotal": { … } } ],
  "totals":   [ { "label", "current", "comparison", "difference", "emphasis" } ]
}
```

É esta forma que permite ter **um só renderizador** para ecrã, PDF e Excel.
O extrato é a exceção: precisa de saldo corrido por linha, o que a forma acima
não exprime, e por isso tem renderizadores próprios.

## Decisões que valem a pena conhecer

**Base de caixa, assumida.** O razão é de partida única (cada movimento toca uma
conta de tesouraria). Não há contas de proveitos/custos, logo não é possível
produzir demonstrações por competência. Em vez de fingir, os relatórios chamam-se
"de Caixa" e trazem o aviso metodológico em `meta.warnings`.

**Linhas zeradas aparecem.** Numa demonstração formal, uma rubrica sem
movimento mostra `0`, não desaparece. No aging, o `cross join` de escalões ×
direções garante que todos os escalões saem mesmo quando vazios.

**O imposto sai da receita.** Numa venda, a receita reconhecida é líquida do
imposto (`amount - tax_amount`): esse dinheiro é do Estado, não do negócio. O
drill-down mostra o mesmo valor líquido, senão os números não fechariam.

**Estornos: escondidos no resultado, visíveis no extrato.** No Resultado de
Caixa, o lançamento estornado (`status='reversed'`) e o estorno
(`entry_type='reversal'`) são ambos excluídos — o efeito líquido é zero. No
extrato aparecem os dois, marcados e esbatidos: anulam-se no saldo mas ficam no
documento. Um extrato onde um movimento simplesmente desaparece não é auditável.

**O extrato usa a convenção de saldo do resto da app** (`débitos − créditos`,
sem filtro de estado), para o saldo final bater sempre certo com o saldo da
conta mostrado no dashboard.

**Aging é uma fotografia.** Usa os saldos em aberto atuais dos documentos
emitidos até à data de referência; não reconstrói a posição histórica. Por isso
não tem coluna de comparação — seria uma comparação falsa.

## Drill-down

Cada linha traz uma `key` estável (`income:<categoria>`, `expense:<categoria>`,
`receivable:<escalão>`, `payable:<escalão>`). `report_drilldown` devolve os
documentos que compõem essa linha **e o total**, para o utilizador confirmar que
a soma bate certo com o número apresentado. O painel di-lo explicitamente:
"Os valores conferem" ou aponta a diferença.

## Exportação

Rotas `POST /api/reports/export/pdf` e `/xlsx` (runtime Node):

1. autenticam o utilizador;
2. validam tipo de relatório, org (UUID), datas e — no extrato — a conta;
3. chamam a RPC (que revalida auth + organização + RLS);
4. registam a exportação em `report_exports` (versão incremental) **antes** de
   gerar, para haver rasto mesmo se a geração falhar;
5. renderizam com `@react-pdf/renderer` ou `exceljs`.

O PDF identifica a **empresa** na capa e no cabeçalho; o ZeroMaka aparece só no
rodapé ("Processado por ZeroMaka"). O documento é da empresa, não da ferramenta.

O Excel escapa `= + - @` no início de qualquer texto (injeção de fórmulas) e
usa tabelas com painéis congelados, autofiltro e `#,##0.00;(#,##0.00)`.

Ambos usam tema claro fixo, independente do tema da aplicação.

## Pacote financeiro

`POST /api/reports/export/pack` produz **um só PDF** com tudo o que o
contabilista ou o banco costumam pedir:

1. capa (empresa, período);
2. **índice** — quem recebe percebe logo o que tem em mãos;
3. as quatro demonstrações do período;
4. um extrato por conta não arquivada (`includeLedgers`, ligado por omissão).

Cada demonstração continua a ser calculada pela **sua própria função no
servidor** — o pacote apenas junta resultados, não recalcula nada. Se um
relatório e o pacote divergissem, seria sinal de um bug; por construção não
podem.

Os componentes `StatementBody` e `LedgerBody` são partilhados entre o relatório
individual e o pacote, pelo que uma correção de formatação aparece nos dois.

Fica registado em `report_exports` como `financial_pack`, com o número de
demonstrações e de extratos incluídos em `filters_json`.

## Segurança

Todas as funções de relatório são `SECURITY INVOKER` (respeitam RLS) e validam
a pertença à organização com `p_org_id not in (select user_org_ids())`.
`execute` é revogado a `public` e `anon`, concedido só a `authenticated`.

Consequência prática: a organização A nunca consegue ler dados da B, mesmo que
alguém manipule o pedido no browser. Isto é testado, não assumido.

## Testes

`supabase/tests/phase5_reports.test.sql` — 42 asserções, fixtures isoladas
(orgs `a5`/`b5`) criadas e limpas pelo próprio ficheiro.

```bash
psql "$DATABASE_URL" -f supabase/tests/phase5_reports.test.sql
```

Cobre: receita líquida de imposto, exclusão do capital dos sócios, limites do
período, comparação, exclusão de estornos, os cinco escalões do aging (incluindo
o vazio), reconciliação do drill-down, e do extrato os invariantes
`saldo final = inicial + entradas − saídas`, `último saldo corrido = saldo final`
e `saldo final = saldo autoritativo da conta`. As últimas quatro asserções
verificam que a org B é bloqueada em todos os quatro relatórios.

> Nota de honestidade: na primeira execução falharam duas asserções — e o erro
> era das **expectativas do teste**, não do código: uma receita de fevereiro é
> anterior ao período de março e entra, corretamente, no saldo inicial do
> extrato. Os invariantes (33 e 35) passaram desde o início, que é precisamente
> o sinal de que o cálculo estava certo.
