# Proteção de rotas

## A regra

**Tudo sob `/app` é privado. Tudo o resto é público.**

Não existe lista de páginas privadas. Uma página nova dentro de `/app` nasce
protegida sem ninguém ter de a registar em lado nenhum.

## Porque é assim

A versão anterior fazia o contrário: mantinha uma lista de caminhos públicos e
tratava tudo o resto como privado. Parece equivalente, mas falha ao contrário.

Em 3 de agosto de 2026 o `robots.txt` e o `sitemap.xml` deixaram de funcionar
porque não constavam dessa lista — o middleware mandava os crawlers para o
ecrã de login. O erro foi benigno. O mesmo mecanismo, com os papéis trocados,
teria exposto uma página privada.

Com um prefixo único, esquecer-se de alguma coisa falha para o lado seguro.

## Onde vive a decisão

`lib/routes.ts` — `decideRedirect(caminho, estado)`. Função pura: recebe o
caminho e o estado da sessão, devolve o destino ou `null` para deixar passar.
Sem browser, sem base de dados, testável em milissegundos.

`tests/routes.test.mjs` cobre-a. `npm test`.

## As regras, em tabela

| Estado | `/app/*` | `/onboarding` | `/entrar`, `/criar-conta` | Público |
|---|---|---|---|---|
| Sem sessão | → `/entrar?next=…` | → `/entrar` | passa | passa |
| Sessão sem organização | → `/onboarding` | passa | → `/onboarding` | passa |
| Sessão completa | passa | → `/app/dashboard` | → `/app/dashboard` | passa |

### Duas exceções deliberadas

**`/redefinir-senha` não é tratada como ecrã de autenticação.** O link de
recuperação cria sessão *antes* de o utilizador escolher a nova palavra-passe.
Se a regra "com sessão sai dos ecrãs de entrada" se aplicasse aqui, o fluxo de
recuperação nunca chegaria ao fim.

**`/auth/callback`, `/robots.txt`, `/sitemap.xml` e `/api/*` nunca são
redirecionados.** O callback precisa de correr antes de existir sessão; os
outros são servidos a crawlers.

## Duas camadas, não uma

**Middleware** (`middleware.ts`) — só verifica se existe sessão válida, com
`getUser()` (valida o token no servidor) e nunca `getSession()` (confia no
cookie). Sai imediatamente nas páginas de marketing, para uma visita pública
não pagar uma ida à rede.

Não verifica a organização de propósito: seria uma segunda consulta à base de
dados em cada pedido. Passa `hasOrg: "unknown"` e adia essa decisão.

**Layout de `/app`** — confirma a organização. Corre no servidor de qualquer
forma, por isso a verificação sai de graça.

**Base de dados** — a terceira e última camada. RLS por `organization_id`.
Mesmo que as duas anteriores falhassem, o Postgres recusa devolver linhas de
uma organização a quem não é membro dela. É a única que não se pode contornar
com um pedido bem construído.

## Open redirects

`safeNext()` filtra o parâmetro `?next=`. Recusa URLs absolutas
(`https://…`), protocol-relative (`//…`), barras invertidas — que alguns
browsers normalizam para `/` — e destinos que causariam um ciclo de
redirecionamento. Testado em `tests/routes.test.mjs`.

## Ao acrescentar uma página

- **Privada** → criar em `app/app/`. Não é preciso mais nada.
- **Pública** → criar em `app/(marketing)/` **e** acrescentar a
  `PUBLIC_ROUTES` em `lib/routes.ts`. Essa constante alimenta o middleware, o
  `robots.txt` e o `sitemap.xml` ao mesmo tempo — o sitemap não pode divergir
  da realidade.
