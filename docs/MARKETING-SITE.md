# Site de marketing — estrutura

Site público e aplicação vivem no **mesmo projeto Next.js**. Partilham tokens
de design, componentes e sessão; um segundo projeto só duplicaria trabalho.

## Route groups

```
app/
├── (marketing)/    →  /, /precos, /funcionalidades…   público, estático
├── (auth)/         →  /entrar, /criar-conta…          público, noindex
├── onboarding/     →  /onboarding                     exige sessão
├── app/            →  /app/*                          exige sessão + organização
└── auth/callback/  →  troca de código PKCE
```

Os parênteses não aparecem no URL — servem para dar um layout próprio a cada
zona. `app/` (sem parênteses) é um segmento real: é o prefixo que
[protege a aplicação inteira](./ROUTE-PROTECTION.md).

## Layouts

| Layout | Dá |
|---|---|
| `(marketing)/layout.tsx` | Cabeçalho, rodapé, atalho "saltar para o conteúdo" |
| `(auth)/layout.tsx` | Painel laranja da marca + formulário. `robots: noindex` |
| `onboarding/page.tsx` | Barra de progresso, sem navegação que distraia |
| `app/layout.tsx` | Barra lateral, navegação inferior no telemóvel, avisos |

## Componentes

| Componente | Notas |
|---|---|
| `marketing/MarketingHeader` | Cliente — menu de telemóvel. Fecha ao mudar de página |
| `marketing/MarketingFooter` | Servidor |
| `marketing/DashboardPreview` | Servidor. Valores inventados, marcados como demonstração |
| `PasswordInput` | Mostrar/esconder, com `aria-label` que muda de estado |

O cabeçalho mostra sempre *Entrar* e *Começar gratuitamente*, mesmo com sessão
iniciada. É deliberado: perguntar quem é o visitante obrigaria a uma ida à rede
em cada visita e tornaria as páginas dinâmicas. Quem já tem sessão e clica em
*Entrar* é encaminhado pelo middleware para o dashboard — mesmo destino, sem
custo.

## Renderização

As nove páginas públicas são **estáticas**. O middleware sai delas antes de
falar com o Supabase, por isso uma visita pública não espera por rede nenhuma.

Confirmar no `npm run build`: devem aparecer com `○ (Static)`.

## Design

Sem biblioteca de componentes. Tailwind com os tokens já existentes:

- `maka-*` — laranja da marca; `ink-*` — cinzentos, via variáveis CSS que
  invertem entre claro e escuro; `onbrand` — texto sobre laranja, fixo escuro
  nos dois temas
- Classes utilitárias em `app/globals.css`: `.card`, `.btn-primary`,
  `.btn-ghost`, `.input`, `.label`
- Tipografia: Archivo Black (títulos), Inter (corpo)

Claro, escuro e sistema funcionam em todo o lado.

## Acessibilidade

- Atalho para saltar a navegação, visível ao receber foco
- `aria-current="page"` na navegação
- `aria-expanded` / `aria-controls` no menu de telemóvel
- Ícones decorativos com `aria-hidden`; ícones informativos com texto
- Erros em `role="alert"`, confirmações em `role="status"`
- Tabelas com `<caption>` e `<th scope>`
- Tabelas largas rolam dentro do próprio contentor — a página nunca rola na
  horizontal

## Ver também

- [Páginas públicas](./PUBLIC-PAGES.md) — conteúdo e regras editoriais
- [SEO](./SEO.md)
