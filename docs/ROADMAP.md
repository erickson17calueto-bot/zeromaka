# ZeroMaka — Roadmap

Micro-SaaS financeiro (mercado angolano). Migração de demo localStorage → SaaS multiempresa em Supabase (PostgreSQL + Auth + RLS), Next.js 14, Vercel.

## Estado

| Fase | Descrição | Estado | Docs |
|------|-----------|--------|------|
| 1 | Auth, organizações, membros, papéis, empresa, contas, contactos, camada de acesso, RLS, auditoria | ✅ Concluída | 000-charter, 002-auth |
| 2 | Motor financeiro — livro de partidas dobradas, saldo derivado, reversão, numeração, idempotência | ✅ Concluída | 005-financial-engine |
| 3 | Contas a receber/pagar, liquidações parciais/totais, cobranças manuais, promessas | ✅ Concluída · 35/35 testes | 006-receivables-payables |
| 4 | Disponível de verdade e reservas financeiras | ✅ Concluída · 35/35 testes | 007-true-available-cash |
| 5 | Previsão de caixa (determinística, cenários) | ⏳ Pendente | — |
| 6 | Requisições, aprovações e orçamentos | ⏳ Pendente | — |
| 7 | Notificações, cobranças e resumo financeiro | ⏳ Pendente | — |
| 8 | Importação de extratos e reconciliação | ⏳ Pendente | — |
| 9 | Planos, subscrições e limites | ⏳ Pendente | — |
| 10 | Segurança, observabilidade e administração | ⏳ Pendente | — |
| 11 | Onboarding, experiência final e lançamento | ⏳ Pendente | — |

## Regras vinculativas (resumo do charter)
- Todo dado empresarial tem `organization_id` + RLS; autorização validada no PostgreSQL (auth.uid + org + papel + propriedade), nunca só no frontend.
- Dinheiro: `numeric(20,2)`; saldos derivam de movimentos; nada de floats JS em cálculos críticos.
- Movimentos confirmados nunca apagados — reversão + auditoria. Operações relacionadas numa transação. Idempotência em operações críticas.
- Sem emissão fiscal certificada / AGT / SAF-T / QR fiscal nesta etapa.
- Cada fase: migrações → tipos → testes → lint → typecheck → build → RLS → advisors → docs → commit. Não concluir com build/testes a falhar.

## Convenções técnicas
- Escritas financeiras via funções `SECURITY DEFINER` com verificação interna; leitura/cálculo via `SECURITY INVOKER` (respeita RLS).
- Numeração: `MOV-` (livro), `REC-`/`PAG-` (obrigações), `LIQ-` (liquidações).
- Migrações em `supabase/migrations/`; testes SQL (impersonação JWT) em `supabase/tests/`.
- Branch por fase (`feat/…`); commits pequenos e descritivos; sem push automático.
