# Onboarding

Seis etapas entre criar conta e ter a empresa a funcionar.
`app/onboarding/page.tsx`.

## As etapas

| # | Etapa | Obrigatório | Saltável |
|---|---|---|---|
| 1 | Empresa — nome, nome legal, NIF, atividade, contactos, localização | nome próprio + nome comercial | não |
| 2 | Finanças — regime fiscal, moeda, exercício, reserva mínima | tem valores por omissão | não |
| 3 | Primeira conta — tipo, nome, banco, saldo atual | nome da conta | não |
| 4 | Contactos — um cliente, um fornecedor | nada | sim |
| 5 | Obrigações — a receber, a pagar | nada | sim |
| 6 | Resumo e conclusão | — | não |

Valores por omissão: fuso `Africa/Luanda`, moeda `AOA`, exercício em janeiro,
regime `geral`.

A etapa 5 só mostra os campos dos contactos indicados na etapa 4 — pedir uma
fatura de um cliente que não existe não faz sentido.

## Estado

Em `profiles`:

| Coluna | Para quê |
|---|---|
| `onboarding_status` | `pending` ou `completed` |
| `onboarding_step` | Onde ficou (0–6) |
| `onboarding_completed_at` | Quando concluiu |
| `onboarding_draft` | O que já preencheu, em JSON |

Antes disto, "concluído" era inferido de `current_org_id` não ser nulo. Chega
para um formulário; não chega para retomar um fluxo a meio.

## Rascunho

`save_onboarding_progress(p_step, p_draft)` grava 800 ms depois da última
alteração. Fechar o browser e voltar retoma na etapa certa com os campos
preenchidos.

O parâmetro é `integer`, não `smallint`: o PostgREST resolve um número JSON
para `integer` e com `smallint` **não encontrava a função** — o rascunho nunca
chegava a ser gravado. O erro passou despercebido porque o resultado da
chamada era ignorado. Hoje é registado na consola.

## Conclusão

`complete_onboarding(p_payload jsonb)`. Numa **só transação**:

1. Organização, com slug único (normaliza acentos, tenta sufixos até não colidir)
2. Membro `owner`
3. Empresa, com todos os campos das etapas 1 e 2
4. `profiles`: nome, `current_org_id`, `onboarding_status = completed`
5. Definições financeiras, com a reserva mínima
6. Primeira conta **e o saldo de abertura**
7. Contactos e obrigações opcionais
8. Registo de auditoria

Se qualquer passo falhar, nada fica meio criado. Isto foi observado na
prática: durante o desenvolvimento, um erro no passo 8 reverteu a organização,
a empresa e a conta já criadas.

### Saldo inicial

Entra pelo **livro financeiro**, reutilizando `create_account_with_balance`,
que gera um lançamento `opening_balance`. Nunca por escrita direta no saldo.

`get_account_balances` calcula o saldo só a partir de `journal_lines` — a
coluna `accounts.initial_balance` não entra na conta e não deve ser lida.

### Idempotência

Se o perfil já estiver `completed`, a função devolve a organização existente
com `already_completed: true` em vez de criar uma segunda. Recarregar a página
no momento errado não duplica nada.

## Armadilhas encontradas

**`companies.nif`, `address` e `phone` são `NOT NULL` com default `''`.**
Passar `NULL` explicitamente ignora o default e viola a restrição — o que
acontecia sempre que o utilizador deixava o campo em branco, ou seja, no caso
normal. Usar `coalesce(..., '')`, nunca `nullif`.

**`audit_logs.action` só aceita `INSERT`, `UPDATE`, `DELETE`.** É um registo
de alterações de linhas, não de eventos. O nome do evento vai em `new_data`.

**`complete_onboarding` usa `search_path = public`, não vazio.** As funções
reutilizadas resolvem helpers como `user_writable_org_ids()` sem qualificação
de esquema. Sendo um valor fixo e não controlado pelo utilizador, não abre
vetor de injeção.

## Ver também

- [Autenticação](./AUTH-FLOW.md)
- [Motor financeiro](./005-financial-engine.md)
