# Páginas públicas

Nove páginas, todas estáticas. `app/(marketing)/`.

| Rota | Ficheiro | Conteúdo |
|---|---|---|
| `/` | `page.tsx` | Hero, problemas, como funciona, Disponível de verdade, funcionalidades, público-alvo, segurança, relatórios, convite a piloto, CTA |
| `/funcionalidades` | `funcionalidades/page.tsx` | 10 funcionalidades, cada uma com problema, solução, benefício e exemplo |
| `/precos` | `precos/page.tsx` | Três planos, tabela comparativa, perguntas sobre preços |
| `/seguranca` | `seguranca/page.tsx` | O que está implementado — e o que ainda não |
| `/sobre` | `sobre/page.tsx` | Missão, problema, público, princípios |
| `/contacto` | `contacto/page.tsx` | Formulário funcional + informação de contacto |
| `/ajuda` | `ajuda/page.tsx` | 12 perguntas frequentes |
| `/termos` | `termos/page.tsx` | Condições de utilização |
| `/privacidade` | `privacidade/page.tsx` | Que dados, para quê, que direitos |

A lista viva está em `PUBLIC_ROUTES` (`lib/routes.ts`), que alimenta ao mesmo
tempo o middleware, o `robots.txt` e o `sitemap.xml`.

## O que não fazemos

**Sem depoimentos inventados.** Não há clientes para citar, por isso a secção é
um convite a participar no piloto e diz isso mesmo.

**Sem certificações inventadas.** `/seguranca` tem uma secção — *O que ainda
não afirmamos* — que lista explicitamente o que falta: sem ISO, sem SOC 2, sem
plano de recuperação testado, sem 2FA, sem SLA. Um selo que ninguém auditou é
pior do que selo nenhum.

**Sem preços inventados.** Ver [preços](#preços).

**Sem dados reais na demonstração.** `components/marketing/DashboardPreview.tsx`
usa valores fixos e inventados, marcados no ecrã como *Dados de demonstração*.

## Preços

`lib/pricing.ts`. Hoje `LANCAMENTO_GRATUITO = true`: a app é gratuita e as
páginas dizem-no.

Quando houver preços: pôr a constante a `false` e preencher `preco` em cada
plano. As páginas leem daí — não há valores escritos à mão em JSX.

Os planos (Solo, Equipa, Contabilista) e a tabela comparativa descrevem
capacidades reais do produto.

## Aviso sobre relatórios

A homepage e `/ajuda` dizem que os relatórios são de gestão interna e **não
substituem demonstrações certificadas nem o contabilista**. O ZeroMaka também
não é software de faturação certificado pela AGT. Manter estes avisos.

## Legal

`/termos` e `/privacidade` descrevem com honestidade o que o produto faz.
**Não foram escritos por advogado.** Antes de uso comercial sério, devem ser
revistos por alguém habilitado.

## Formulário de contacto

`/contacto` → `POST /api/contacto` → `submit_contact_message` (RPC).

Três barreiras: validação no cliente, validação na rota, validação na função
da base de dados. Só a última não se contorna.

- `anon` pode submeter pela função, mas **não consegue ler** as mensagens —
  não há política de RLS que o permita.
- Limite de **5 envios por hora** por origem, aplicado dentro da função.
- Guardamos um **hash** do IP, nunca o IP.
- Campo isco invisível apanha robôs; a resposta finge sucesso para não dar pistas.

Verificado em SQL: submissão anónima aceite, leitura bloqueada, limite a
disparar à sexta tentativa.

**As mensagens não são notificadas por e-mail.** Ficam em
`public.contact_messages` e alguém tem de as ir ver.

## Ver também

- [Site de marketing](./MARKETING-SITE.md) — estrutura e componentes
- [SEO](./SEO.md)
