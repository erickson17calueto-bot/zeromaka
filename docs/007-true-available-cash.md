# 007 — Disponível de verdade e reservas financeiras (Fase 4)

Separa dinheiro existente, comprometido, reservado e realmente seguro para gastar.
Apoio à decisão — **não** aconselhamento contabilístico definitivo.

## Fórmula oficial

```
Disponível de verdade =
    Saldo atual (Σ journal_lines das contas incluídas)
  − Reservas financeiras ativas
  − Compromissos não cobertos (contas a pagar no horizonte, − parte coberta por reservas)
  − Requisições aprovadas ainda sem lançamento no livro
  − Reserva mínima de caixa
```

Horizonte configurável 7 / 15 / 30 dias (padrão 7). O resultado **pode ser negativo** — nunca forçado a zero.

### Anti-dupla-contagem
- **Reserva ligada a obrigação**: o valor reservado conta como reserva; só a parte pendente **não coberta** conta como compromisso adicional. `covered = min(pendente, Σ reservas ligadas ativas)`.
- **Requisição convertida em obrigação**: uma requisição aprovada com `journal_entry` ligado (`metadata.requisition_id`) **não** é contada (o livro já reflete o gasto). No fluxo atual, aprovar uma requisição lança de imediato → o conjunto de "requisições aprovadas sem lançamento" é normalmente vazio (documentado; futura Fase 6 pode introduzir o estado aprovado-mas-não-pago).
- Pagamentos revertidos e obrigações pagas/canceladas não entram.

## Tabelas (numeric(20,2), organization_id, RLS)

| Tabela | Função |
|--------|--------|
| `reserve_categories` | Categorias (payroll/tax/emergency/rent/supplier/maintenance/investment/custom); seed de 7 no onboarding |
| `financial_reserves` | Reserva: general / account_specific / obligation_linked; prioridade; alvo; status active/partially_released/released/cancelled |
| `reserve_movements` | Histórico imutável (create/increase/decrease/release/cancel/consume_on_payment) |
| `organization_financial_settings` | Horizonte, reserva mínima, incluir vencidas/requisições/arquivadas |

## Funções PostgreSQL

| Função | Segurança | Papel |
|--------|-----------|-------|
| `create_reserve` / `increase_reserve` / `release_reserve` / `cancel_reserve` | DEFINER | writable; crítica só owner/admin liberta/cancela |
| `update_financial_settings` | DEFINER | owner/admin |
| `seed_reserve_categories` | DEFINER | writable (onboarding) |
| `get_true_available_cash(org, horizon?, account?)` | **INVOKER** | membro; respeita RLS; calculado no servidor |
| `post_settlement(..., p_reserve_id)` | DEFINER | consumo atómico de reserva no pagamento |

`get_true_available_cash` devolve: current_cash_balance, active_reserves_total, minimum_cash_buffer, overdue/upcoming_payables_total, approved_requisitions_total, covered/uncovered totals, true_available_cash, horizon, safety_state e uma **decomposição** completa (contas, reservas, obrigações com cobertura, requisições).

## Estado de segurança (determinístico, sem IA)
- **Crítico**: disponível ≤ 0
- **Atenção**: disponível > 0 e < 20% do saldo atual
- **Seguro**: caso contrário

## Reserva ≠ movimento
Criar/aumentar/libertar reserva **nunca** move dinheiro, cria receita/despesa ou `journal_entry`. Só o **consumo no pagamento** (via `post_settlement` com `p_reserve_id`) reduz a reserva atomicamente com o lançamento real.

## Segurança
- RLS SELECT por membros da org em todas as tabelas novas; escrita só via funções DEFINER (reservas escritas só por RPC).
- GRANTs mínimos: SELECT a `authenticated`; execução das RPCs revogada de anon/public.
- Correção: `audit_financial_change` usa `NEW.id`; `organization_financial_settings` não tem `id` (PK = organization_id) → trigger dedicado `audit_financial_settings` (record_id = organization_id), não invocável como RPC.

## Simulações (instantâneas, não gravam)
Despesa / recebimento / libertação — recalculam o disponível no cliente sem criar movimentos. Contas a receber **nunca** entram no disponível (só após pagamento efetivo).

## UI
- **Dashboard**: bloco "Disponível de verdade" (estado, horizonte 7/15/30, "Ver cálculo" com decomposição linha-a-linha, "Simular").
- **Reservas**: criar/aumentar/libertar (parcial/total)/cancelar; geral/conta/obrigação; prioridade; alvo; total reservado, críticas; reserva mínima editável.
- **Contas a pagar**: mostra reservado/descoberto por obrigação; opção "consumir reserva ligada" no pagamento.

## Testes
`supabase/tests/phase4_true_available_cash.test.sql` — 35 asserções via impersonação JWT (2 orgs, owner/viewer/finance). **35/35 verdes**. Inclui o cenário manual (base 500K; reserva ligada 400K mantém total; libertar 100K → 600K; consumo atómico no pagamento) e isolamento cross-org + RLS + anon.

### Cenário manual validado
BAI 3M + Caixa 500K = 3.5M; reservas 1.5M; a pagar 7d 1M; reserva mínima 500K → **disponível 500K**. Ligar reserva 400K a fornecedor B → total inalterado (400K coberto, sem dupla contagem). Libertar 100K → **600K**. Consumo de reserva no pagamento reduz saldo e reserva atomicamente.

## Limitações / riscos
- Requisições aprovadas-sem-lançamento = 0 no fluxo atual (aprovar lança já). O termo está implementado e pronto para a Fase 6.
- Concorrência coberta por `FOR UPDATE` nas reservas/obrigações (testada de forma determinística, não sob carga real).
- Avisos de advisor pré-existentes (search_path mutable nos RPCs invoker, trigger fns invocáveis das Fases 1-3) ficam para a revisão de segurança da Fase 10.
