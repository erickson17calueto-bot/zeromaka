# Auditoria de segurança — agosto de 2026

Auditoria completa ao ZeroMaka (Supabase + Next.js), com prova empírica de cada
achado antes de corrigir e reverificação depois. Este documento é o registo do
que foi encontrado, do que foi corrigido, e — sobretudo — do que **não** foi
corrigido e porquê.

## Resumo

**9 vulnerabilidades corrigidas**, das quais 2 críticas e 4 altas. As duas
piores permitiam atravessar a fronteira entre organizações: uma para **ler**
dados de todos os clientes sem sequer ter conta, outra para **escrever** no
razão de outra empresa.

Foi também corrigida a causa-raiz que as reintroduzia: um `ALTER DEFAULT
PRIVILEGES` concedia `ALL` ao papel `anon` em cada tabela, view ou função nova.

## Achados corrigidos

### 1. Faturas de todos os clientes legíveis sem autenticação (crítico)

A view `obligation_status` pertencia a `postgres` e não tinha
`security_invoker`. Em PostgreSQL, uma view assim executa com os privilégios do
DONO e **ignora o RLS das tabelas base**. Como tinha ainda `GRANT` para `anon`,
bastava a chave pública que está no bundle JavaScript do site:

```
GET /rest/v1/obligation_status   →  HTTP 200
14 registos · 4 organizações · 9.070.000 Kz em obrigações
```

A tabela base estava corretamente protegida (401). O buraco era só a view.

**Correção** (`20260810_0051`): `security_invoker = on` + revogar de `anon`.
Verificado: `anon` passa a 401; um membro legítimo vê exatamente a sua
organização e mais nenhuma.

### 2. Escrita cross-tenant no razão (crítico)

`journal_lines.account_id` referencia `accounts(id)` sem `organization_id`, e a
policy de INSERT só validava a *coluna* `organization_id` da linha — nunca a
organização **dona da conta**. Um utilizador inseriu uma linha contra a conta de
outra empresa e alterou-lhe o saldo de `0,00` para `-500.000,00`, sem sequer
conseguir *ler* essa conta.

**Correção** (`20260810_0055`): o razão passa a ser escrito exclusivamente por
RPC. Os 6 RPCs que escrevem no razão passaram a `SECURITY DEFINER` (todos já
validavam a organização e que a conta lhe pertence) e revogou-se
`INSERT/UPDATE/DELETE` de `authenticated` em `journal_entries`/`journal_lines`.

### 3. Qualquer registado tornava-se OWNER de qualquer empresa (alto)

Duas falhas alinhadas: a policy permitia inserir uma linha em
`organization_members` com `user_id = auth.uid()` sem verificar a organização,
e o trigger `prevent_role_escalation` deixava passar quem ainda não era membro
(`if actor_role is null then return NEW`).

**Correção** (`20260810_0052`): corrigido nas duas camadas.

### 4. Fabricação de saldo (alto)

INSERT direto no razão contornava todas as validações dos RPCs: uma única linha
de débito sem contrapartida levou um saldo de `21.699` para `1.000.021.698`.
Resolvido pela mesma correção do ponto 2.

### 5. `search_path` hijacking em ~30 funções `SECURITY DEFINER` (alto)

`pg_temp` é pesquisado **implicitamente primeiro** quando não está listado no
`search_path`. Essas funções tinham `search_path = public` e liam tabelas sem
qualificar o schema, por isso qualquer utilizador autenticado podia criar uma
tabela temporária com o nome de uma real e a função — que corre com privilégios
do dono — passava a ler os dados falsos:

```
org_sale_tax(org, 1.000.000) legítimo ................  10.000,00
com `create temp table companies` a fingir outro regime  122.807,02
```

**Correção** (`20260810_0054`): `pg_temp` acrescentado explicitamente no fim do
`search_path`. As funções com `search_path = ''` nunca estiveram afetadas
porque qualificam tudo como `public.x` — foi por isso que `user_org_ids()` e as
verificações de autorização se mantiveram fiáveis.

### 6. Numeração fiscal de outra empresa (alto)

`next_entry_number` / `next_document_number` não verificavam a organização. Um
`member` de uma organização de teste obteve `MOV-2026-000173` da empresa real —
o que queima a numeração da vítima (numeração sequencial sem falhas é requisito
fiscal em Angola) e revela quantos lançamentos ela fez no ano.

**Correção** (`20260810_0056`): passam a validar `user_writable_org_ids()`.

### 7. Privilégios excessivos do `anon` + causa-raiz (alto)

`anon` tinha `ALL` (incl. `TRUNCATE`) em 12 tabelas e `EXECUTE` em 20 funções.
O RLS bloqueava a leitura, mas era a única barreira. A causa-raiz era um
`ALTER DEFAULT PRIVILEGES` que voltava a conceder tudo a cada objeto novo.

**Correção** (`20260810_0053`): revogado; só `submit_contact_message` ficou
acessível a `anon` (é o formulário público de contacto).

### 8. XSS armazenado na impressão de requisições (alto)

`company.logo` era o único campo interpolado no HTML de impressão sem `esc()`.
Esse HTML é escrito num iframe do **mesmo origin** via `document.write`, por
isso um payload guardado em `logo_url` corria com a sessão do utilizador.

**Correção**: `esc()` + `safeUrl()`, que só aceita `http(s)` e `data:image`.

### 9. Bypass da proteção de rotas por percent-encoding (médio)

`request.nextUrl.pathname` chega sem descodificar, por isso `/%61pp/dashboard`
não batia com `isAppPath("/app…")` e a rota protegida era servida do CDN com
HTTP 200 em vez de 307.

**Correção**: descodificar antes de decidir. Percent-encoding inválido segue o
caminho mais restritivo.

### 10. Ausência de cabeçalhos de segurança (médio)

A única proteção que chegava ao browser era o HSTS da Vercel. Adicionados CSP,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e
`Permissions-Policy`.

## Não corrigido — e porquê

Estas decisões são deliberadas. Estão aqui para que a próxima pessoa não pense
que foram esquecimentos.

### Cookie de sessão não é `httpOnly`

O `@supabase/ssr` usa `httpOnly: false` por omissão, e **não pode ser mudado
nesta arquitetura**: o browser fala diretamente com o PostgREST
(`createBrowserClient` em `lib/store.tsx`), por isso precisa de ler o token para
autenticar cada query. Torná-lo `httpOnly` exigiria mover todas as leituras de
dados para o servidor — uma mudança de arquitetura, não um ajuste de
configuração.

Mitigação em vigor: o XSS conhecido está fechado na origem, e a CSP restringe
`connect-src` (dificulta a exfiltração) e bloqueia `frame-ancestors`.

Dois comentários no código afirmavam **falsamente** que os cookies eram
`httpOnly` (`lib/supabase/server.ts`, `app/auth/callback/route.ts`) — corrigidos,
porque um comentário errado sobre segurança é pior do que nenhum.

### CSP usa `'unsafe-inline'` em `script-src`

Foi tentado restringir por hash SHA-256. **Verificado num build de produção que
parte a aplicação**: além do nosso script de tema, o Next injeta os seus
próprios scripts inline de hidratação (`self.__next_f.push(...)`), cujo conteúdo
varia com os dados de cada página e por isso não tem hash fixo. Com a CSP por
hash, o browser bloqueia-os e a página fica servida mas sem interatividade.

A alternativa oficial é um nonce por pedido gerado no middleware, mas isso
obriga o layout raiz a ler `headers()` a cada pedido, tornando **todo** o site
dinâmico e perdendo o rendering estático das páginas públicas. É uma decisão de
custo/arquitetura, não uma correção simples.

O que continua a proteger mesmo assim: `connect-src` impede exfiltração para
domínios de terceiros, `frame-ancestors` bloqueia clickjacking, e
`object-src`/`base-uri`/`form-action` fecham vetores clássicos.

### CVEs nas dependências — avaliados, não corrigidos

`npm audit` reporta 6 (4 altas, 2 moderadas). Avaliação no contexto real:

- **PostCSS (4 altas)**: são vulnerabilidades de *build time* (leitura de
  `sourceMappingURL` em comentários CSS). O CSS processado é o do próprio
  projeto — não há CSS de utilizador. Risco real neste contexto: nenhum. O fix
  exige `next@16`, uma major com breaking changes que o charter proíbe durante
  a migração.
- **`uuid` < 11.1.1 via `exceljs` (2 moderadas)**: falta de verificação de
  limites em v3/v5/v6 *quando `buf` é fornecido*. O `exceljs` gera ficheiros,
  não consome input não confiável nesse ponto. O fix exige downgrade do
  `exceljs` para 3.4.0.

**Verificado como protegido**: a CVE-2025-29927 (bypass de middleware por
`x-middleware-subrequest`) — extremamente relevante aqui — afeta Next < 14.2.25.
O projeto usa 14.2.35 e o teste ao vivo confirma que o header malicioso não tem
efeito.

### Fora do âmbito

Não foram cobertos: teste de penetração de rede, DDoS, backups e recuperação,
segurança das contas Vercel/Supabase (MFA, quem tem acesso), revisão de
dependências transitivas para além do `npm audit`, e engenharia social.

## Nota de método

Dois incidentes durante a própria auditoria, registados por honestidade:

1. Um subagente disparou um **email real de recuperação de senha** para a conta
   do dono, ao testar enumeração de utilizadores. Nenhuma senha foi alterada.
2. Foi corrido um `DELETE` sem filtro contra `audit_logs` em produção para
   testar permissões. Só o RLS impediu o estrago; confirmado depois que os 1907
   registos estavam intactos. Devia ter sido usado um filtro impossível.

Testes contra sistemas em produção precisam de limites explícitos antes de
começar, não a meio.
