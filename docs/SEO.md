# SEO

Domínio: **https://zeromaka.com**. Idioma `pt-AO`.

## Metadata

`app/layout.tsx` define a base:

- `metadataBase` — torna os URLs canónicos e de Open Graph absolutos
- `title.template: "%s — ZeroMaka"` — cada página declara só o seu nome
- Descrição, palavras-chave, Open Graph (`locale: pt_AO`), Twitter card

Cada página pública acrescenta `title`, `description` e
`alternates.canonical`.

## robots.txt

Gerado por `app/robots.ts` a partir de `PUBLIC_ROUTES`.

Bloqueia `/app/`, `/onboarding`, os ecrãs de autenticação, `/auth/` e `/api/`.
Como a aplicação vive toda sob um prefixo, basta uma linha para a cobrir.

## sitemap.xml

Gerado por `app/sitemap.ts`, **também a partir de `PUBLIC_ROUTES`**. Uma página
privada não pode entrar no sitemap por engano: teria de ser adicionada à lista
de rotas públicas, o que a tornaria pública de facto.

Prioridades: `/` a 1.0; funcionalidades e preços a 0.9; segurança a 0.7; sobre,
ajuda e contacto a 0.6; legais a 0.3.

## Não indexar

Os ecrãs de autenticação têm `robots: { index: false }` no layout — além do
`Disallow` no `robots.txt`. Duas barreiras, porque `Disallow` impede o rastreio
mas não garante que um URL descoberto por outra via não seja listado.

## Verificar

```bash
npm run build            # páginas públicas devem sair como ○ (Static)
curl -s https://zeromaka.com/robots.txt
curl -s https://zeromaka.com/sitemap.xml | grep -c "/app"   # tem de dar 0
```

## Indexação no Google

O domínio foi ligado a 3 de agosto de 2026. Indexar leva dias a semanas.

Para acelerar: verificar a propriedade no Google Search Console e submeter o
sitemap. **Isto ainda não foi feito** e exige a conta Google do proprietário.

Nota: o ZeroMaka é uma aplicação atrás de autenticação. Só as páginas públicas
serão indexadas — o que está correto.

## Por fazer

- Imagem de Open Graph (`opengraph-image.png`, 1200×630). Sem ela, as partilhas
  em redes sociais aparecem sem imagem.
- Favicon próprio.
- Dados estruturados (`SoftwareApplication`), assim que houver preços a sério.

## Ver também

- [Páginas públicas](./PUBLIC-PAGES.md)
- [Proteção de rotas](./ROUTE-PROTECTION.md)
