# Segurança — empréstimos, adiantamentos e requisições

## Modelo de escrita

`requisitions`, `financial_obligations`, `settlements` e `settlement_allocations` têm RLS com políticas de `SELECT` (`user_org_ids()`) e, no caso de `requisitions`, também `INSERT`/`UPDATE`/`DELETE` diretas para `user_writable_org_ids()` (criação/edição/remoção de requisições continua a passar pela tabela, não por RPC — decisão pré-existente, não alterada nesta fase). Todas as operações que mexem no livro financeiro (`journal_entries`/`journal_lines`) — desembolso, devolução, conversão — passam exclusivamente por RPCs `SECURITY DEFINER`.

**Correção nesta fase:** `approve_requisition()` não era `SECURITY DEFINER` (corria com o privilégio do utilizador chamador) — inconsistente com `grant_employee_loan`, `post_settlement` e o resto das RPCs financeiras. Agora é `SECURITY DEFINER` com `search_path` fixo, como todas as outras.

## Validações em toda RPC nova/alterada desta fase

- `auth.uid()` não nulo.
- `organização in user_writable_org_ids()` (ou `user_org_ids()` para leitura em relatórios).
- Contacto beneficiário pertence à mesma organização e é `kind = 'funcionario'` ou `'ambos'` — nunca um fornecedor ou cliente.
- Conta pertence à organização e não está arquivada.
- Categoria (quando indicada) pertence à organização e é do tipo certo (`expense`).
- Requisição/lançamento/obrigação pertence à organização pedida (`organization_id = p_org_id`) — nunca só `id`.

## Isolamento entre organizações

Testado ao vivo: aprovar/desembolsar/converter/reclassificar/associar usando o `p_org_id` de uma organização diferente da dona do registo falha sempre com "não encontrado" (a query já filtra por `organization_id = p_org_id`, nunca só por `id`) — não há forma de um utilizador de outra organização, mesmo autenticado, tocar em dados que não são seus.

## Prevenção de duplicados como propriedade de segurança

Índices únicos parciais (`idx_obligations_unique_source_requisition`, `idx_obligations_unique_disbursement_entry`) e `select ... for update` nas RPCs de aprovação/desembolso não são só correção contabilística — também impedem que uma chamada repetida (duplo-clique, replay de rede, ou uma tentativa maliciosa de reenviar o mesmo pedido) duplique um desembolso ou uma obrigação.

## Achado de segurança à margem do pedido

Ao investigar `approve_requisition`, encontrámos que `anon` e `authenticated` tinham `GRANT` direto de `DELETE`/`TRUNCATE` em `journal_entries`, `journal_lines` e `requisitions`. Na prática já estava inofensivo — RLS nega `DELETE` por omissão nas duas primeiras (não existe política de `DELETE` nelas) e `TRUNCATE` não é alcançável via PostgREST — mas violava o princípio do menor privilégio. Revogado nesta fase (mesma limpeza já feita antes para `financial_categories`).

## O que ainda não está coberto

- Não existe um teste automatizado de RLS a correr em CI — as verificações desta fase foram manuais, ao vivo, contra o projeto Supabase (`ouhvwbwdfagkdewjhuyt`), não um `supabase/tests/*.sql` novo dedicado a esta fase (os ficheiros `phase*.test.sql` existentes cobrem fases anteriores).
- Acessibilidade (nomes de botão, foco visível, navegação por teclado) não foi auditada especificamente para as novas telas desta fase.
