# Fase 7 — Camada de Acesso a Dados (Supabase)

Data: 2026-07-23 · Projeto Supabase: `zeromaka` (`ouhvwbwdfagkdewjhuyt`, eu-west-3)

## O que mudou

- **`lib/store.tsx` reescrito** — deixou de usar `localStorage` para dados empresariais; agora lê e escreve no Supabase (PostgreSQL via PostgREST + RPC).
- **Interface `useStore()` preservada** — nenhuma página precisou de alteração. Mesmos nomes de métodos, mesmas assinaturas, mesmos valores de retorno.
- **Onboarding** (`app/onboarding/page.tsx`) — página para utilizadores novos criarem a organização, empresa e perfil. Chama a RPC `create_organization` (atómica).
- **Redirect sem org** — `(app)/layout.tsx` redireciona para `/onboarding` se o utilizador está autenticado mas sem `orgId`.
- **Gamificação em localStorage** — XP, badges e streak continuam no `localStorage` (chave `zeromaka_gamification`), separados dos dados empresariais. Cumpre o charter: nenhum dado financeiro sensível no browser storage.

## Padrão de mutação: optimistic + background

1. Validação local síncrona → retorna `string | null` (erro ou sucesso) imediatamente.
2. Estado local atualizado optimisticamente (ex: conta adicionada ao array).
3. Chamada Supabase em background (`.then()`), sem bloquear a UI.
4. Se a chamada falha: rollback do estado local + toast de erro.
5. Para operações atómicas (transferência, markPaid, approveRequisition): chama RPC, depois refetch dos dados afectados para sincronizar IDs reais.

## Mappers DB ↔ Frontend

- **DB→FE** (`dbToAccount`, `dbToTransaction`, etc.): `snake_case` → `camelCase`, `Number()` para campos `bigint`.
- **FE→DB** (`txToDb`, `invToDb`, etc.): inverso, adiciona `organization_id`.
- **Campos parciais** (`txFieldsToDb`, `invFieldsToDb`, etc.): para updates que só enviam os campos alterados.

## Decisões

1. **`currentBalance` derivado**: nunca armazenado — `useMemo` calcula `initialBalance + Σ txDelta(transactions)`. Cumpre o charter.
2. **Client-generated UUIDs**: `crypto.randomUUID()` gera IDs antes do insert. O mesmo UUID vai para o estado local e para o DB. Em operações RPC (transfer, markPaid), o ID local é temporário e é substituído por refetch pós-sucesso.
3. **Refs para orgId/userId**: `useRef` acompanha `orgId` e `userId` para uso em callbacks sem re-render.
4. **`createClient()` por chamada**: cria um novo cliente Supabase em cada operação para evitar referências stale a cookies/session.

## Riscos / pendências

- Sem retry automático em falhas de rede — o utilizador vê o toast e pode repetir a ação.
- O refetch pós-RPC carrega todos os dados da tabela; para volumes grandes, deverá ser optimizado com queries parciais.
- A numeração de requisições (`RQ-001/MM/YYYY`) é baseada no `length` do array local, não numa sequence do DB — pode haver duplicação em uso concorrente.
