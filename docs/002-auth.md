# Fase 1 — Autenticação com Supabase

Data: 2026-07-23 · Projeto Supabase: `zeromaka` (`ouhvwbwdfagkdewjhuyt`, eu-west-3)

## O que mudou

- **Login demo removido** ("qualquer e-mail") → e-mail + palavra-passe reais via Supabase Auth.
- **Registo** na própria página de login (alternância Entrar/Criar conta). Se a confirmação de e-mail estiver ativa no projeto, o utilizador é avisado para confirmar antes de entrar.
- **Proteção de rotas no servidor** via `middleware.ts`: sem sessão → redirect para `/login`; com sessão em `/login` → redirect para `/`. O guard cliente no `(app)/layout.tsx` mantém-se como fallback de UX.
- **Sessão em cookies httpOnly** geridos pelo `@supabase/ssr`. O flag `authed` deixou de ser persistido no `localStorage`.
- `logout()` passa a `supabase.auth.signOut()` (assíncrono).

## Decisões

1. **`@supabase/ssr`** (padrão oficial para App Router) com três pontos de criação de cliente:
   - `lib/supabase/client.ts` — browser
   - `lib/supabase/server.ts` — Server Components/Actions (para fases seguintes)
   - `middleware.ts` — renovação de sessão + proteção de rotas
2. **`getUser()` no middleware, nunca `getSession()`** — `getUser()` valida o JWT junto do servidor Supabase; `getSession()` confia no cookie sem validar (regra do charter: verificar autorização no servidor).
3. **Chave publishable** (`sb_publishable_...`) em `NEXT_PUBLIC_*` — é pública por design; a segurança vem do RLS (fase 8). `service_role` nunca entra no código nem no `.env.local` do frontend.
4. **Dados de negócio continuam no localStorage** nesta fase — são dados demo. A migração para Postgres+RLS acontece nas fases 2–8; só então o requisito "nada financeiro no localStorage" fica satisfeito para dados reais.

## Riscos / pendências

- A confirmação de e-mail está no estado default do projeto Supabase (ativa). Se atrapalhar o onboarding, desativar no Dashboard (Authentication → Providers → Email).
- O perfil (`profile`) ainda é local; será ligado ao `auth.users` na fase 4.
- Sem rate limiting próprio no login — o Supabase Auth já limita tentativas.
