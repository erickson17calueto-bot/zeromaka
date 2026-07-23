# Decisão: manter Next.js 14 com patch 14.2.35 (risco aceite)

Data: 2026-07-23 · Fase 0

## Contexto

O `npm audit` do baseline (next@14.2.5) reportava 1 vulnerabilidade **crítica** (cache poisoning, GHSA-gp8f-8m3g-qvj9) e bypass de autorização no middleware (GHSA-f82v-jwr5-mffw) — inaceitável para uma app que vai construir autenticação sobre middleware.

## Decisão

1. **Atualizado `next` 14.2.5 → 14.2.35** (patch, mesma versão principal — permitido pelo charter). Resolve a crítica e o bypass de middleware.
2. **Não migrar para Next 15/16 agora.** As advisories "high" restantes só têm correção completa em versões principais seguintes; o charter proíbe major bumps durante a migração inicial.

## Risco aceite (a rever após a migração)

As advisories restantes no next@14.2.35 são maioritariamente:
- Específicas de **self-hosting** (Image Optimizer DoS, crescimento de cache em disco) — o deploy é na Vercel, cuja infraestrutura mitiga estes vetores;
- DoS em Server Components/Actions — mitigadas por rate limiting da plataforma;
- Cache poisoning em cenários com CDN próprio — não aplicável no deploy Vercel gerido.

**Ação futura:** planear upgrade para Next 15+ como fase própria depois de a migração Supabase estabilizar.
