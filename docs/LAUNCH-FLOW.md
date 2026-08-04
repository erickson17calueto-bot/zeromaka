# Lançamento

Estado da infraestrutura e o que falta antes de convidar utilizadores a sério.

## O que já está

| Peça | Estado |
|---|---|
| Domínio | `zeromaka.com` no Namecheap, DNS a apontar para a Vercel |
| SSL | Emitido pela Vercel, apex redireciona para `www` |
| Alojamento | Vercel, projeto `zeromaka_2` (equipa `orbin-team`) |
| Repositório | `github.com/erickson17calueto-bot/zeromaka` |
| Deploy automático | Cada push para `main` publica |
| Base de dados | Supabase `ouhvwbwdfagkdewjhuyt` (eu-west-3) |
| Variáveis | `NEXT_PUBLIC_SUPABASE_URL` e `..._ANON_KEY` em Production e Preview |
| URLs de auth | Site URL e Redirect URLs incluem o domínio, `www`, o URL da Vercel e `localhost` |

## Antes de convidar utilizadores

**Decidir a confirmação de e-mail.** Está **ativa**: quem se regista tem de
abrir um link antes de entrar. Mais seguro, mas acrescenta atrito. Supabase →
Authentication → Providers → Email.

**Ler as mensagens de contacto.** Chegam a `public.contact_messages` e **não há
notificação nenhuma**. Sem um hábito de as consultar, ficam por responder.

**Rever os textos legais.** `/termos` e `/privacidade` não foram escritos por
advogado.

**Google Search Console.** Verificar a propriedade e submeter o sitemap.

**Imagem de Open Graph.** Sem ela, partilhas em redes sociais saem sem imagem.

## Antes de cobrar

Definir os preços e pôr `LANCAMENTO_GRATUITO = false` em `lib/pricing.ts`,
preenchendo `preco` em cada plano. As páginas passam a mostrar os valores sem
mais alterações.

Ninguém deve ser cobrado sem escolher um plano de forma explícita — é o que
`/precos` e `/termos` prometem.

## Ao publicar

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Nenhum destes pode falhar. Depois, `git push origin main`.

Alterações estruturais (rotas, autenticação, base de dados) devem ir primeiro
para uma branch, ser testadas na pré-visualização da Vercel, e só depois passar
a `main`.

## Migrações

Ficam em `supabase/migrations/`, aplicadas ao projeto Supabase. **Não são
aplicadas pelo deploy da Vercel** — são um passo à parte. Uma migração aplicada
à base de dados mas não commitada (ou o contrário) parte o ambiente seguinte.

## Ainda em falta

- **Sem testes de browser.** `npm test` cobre a lógica de redirecionamento
  (11 testes). Registo, login e onboarding foram verificados à mão, não há
  suite automática. Playwright é o passo natural.
- **Sem monitorização de erros.** Um erro em produção não avisa ninguém.
- **Analytics sem destino.** `lib/analytics.ts` está preparado mas
  `provider` é `null`. Ligar um fornecedor implica rever o aviso de cookies —
  hoje `/privacidade` diz que só usamos cookies necessários, e isso é verdade.
- **Sem plano de recuperação testado.** `/seguranca` afirma isto
  explicitamente. Manter até ser feito.

## Ver também

- [Proteção de rotas](./ROUTE-PROTECTION.md)
- [Autenticação](./AUTH-FLOW.md)
- [SEO](./SEO.md)
