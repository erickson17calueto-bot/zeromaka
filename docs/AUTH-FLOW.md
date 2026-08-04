# Autenticação

Supabase Auth com `@supabase/ssr`. A sessão vive em cookies que o JavaScript da
página não lê. **Nunca em `localStorage`** — regra do charter.

## Rotas

| Rota | O que faz |
|---|---|
| `/entrar` | Início de sessão |
| `/criar-conta` | Registo: nome, e-mail, palavra-passe, aceitação dos termos |
| `/recuperar-senha` | Pede o link de recuperação |
| `/redefinir-senha` | Define a nova palavra-passe (exige a sessão criada pelo link) |
| `/auth/callback` | Troca o código PKCE por sessão, no servidor |
| `/login` | Redireciona para `/entrar` (rota antiga, mantida) |

`/login` continua a existir porque já anda em ligações partilhadas e nas
Redirect URLs configuradas no Supabase. Remover partiria ambas.

## Registo

Pede o mínimo: **nome, e-mail, palavra-passe, termos**. Os dados da empresa
pertencem ao [onboarding](./ONBOARDING.md) — um formulário gigante à entrada é
a forma mais rápida de perder alguém.

O nome vai em `options.data.full_name` e chega ao perfil. É por isso que o
onboarding já o apresenta preenchido: ninguém escreve o nome duas vezes.

## Confirmação de e-mail

**Está ativa no projeto.** Depois do registo não há sessão — o ecrã pede para
abrir o link recebido, e permite reenviar. O link aponta para `/auth/callback`.

Se for desligada (Supabase → Authentication → Providers → Email), o registo
passa a criar sessão imediatamente e a ir direto para o onboarding. O código
trata dos dois casos.

## Recuperação de palavra-passe

`/recuperar-senha` responde **sempre a mesma mensagem**, exista ou não conta
com aquele e-mail. Dizer "este e-mail não existe" seria uma forma de descobrir
que endereços estão registados.

O link leva a `/auth/callback?next=/redefinir-senha`. O callback cria a sessão
e encaminha. `/redefinir-senha` verifica que existe sessão; sem ela mostra
"link inválido" e oferece pedir outro.

## Callback

`app/auth/callback/route.ts`. Route handler, corre no servidor:

1. Se o Supabase devolveu erro na query (link expirado), vai para `/entrar`
   com a mensagem.
2. Sem código, o mesmo.
3. `exchangeCodeForSession(code)` — grava a sessão em cookies httpOnly.
4. Encaminha para `next` (validado por `safeNext`) ou para o dashboard.

## Mensagens de erro

`lib/auth/messages.ts` traduz os erros do Supabase. O objetivo é serem
compreensíveis sem revelar mais do que o necessário.

## Ver também

- [Proteção de rotas](./ROUTE-PROTECTION.md) — quem pode ir onde
- [Onboarding](./ONBOARDING.md) — o que acontece a seguir ao registo
