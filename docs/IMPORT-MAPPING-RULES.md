Data: 2026-08-05 · Fase 2 do overhaul de importação · `supabase/migrations/20260805_0030_import_mapping_rules.sql`

## Porquê

A sugestão automática de contacto/categoria (`docs/IMPORT-FLOW.md`) acerta muito, mas
há coisas que só o utilizador sabe: "PGT FORN XPTO" desta organização é sempre o
contacto "XPTO Comércio, Lda". Sem um sítio para guardar isso, a mesma correção
repete-se em todas as importações futuras.

## Como funciona

- Tabela `import_mapping_rules`: `organization_id`, `target_type`
  (`transaction`/`receivable`/`payable`), `field` (`contact_id`/`category_id`),
  `match_value` (o texto exato da coluna de origem, ex: o conteúdo da coluna
  "Fornecedor"), `value_id` (o contacto/categoria escolhido).
- Chave única `(organization_id, target_type, field, match_value)` — cada texto só tem
  uma regra por organização e destino.
- **Nunca criada automaticamente.** Só existe quando o utilizador carrega em "lembrar"
  no editor de uma linha, depois de escolher o contacto ou categoria certos. Sem isso,
  o sistema estaria a aprender em silêncio a partir de correções que podem ainda estar
  erradas.
- `remember_import_mapping(p_org_id, p_target_type, p_field, p_match_value,
  p_value_id)` — `SECURITY DEFINER`, faz o upsert (`ON CONFLICT ... DO UPDATE`,
  incrementando `hit_count` e atualizando `last_used_at` em vez de duplicar a regra).
- `normalizeRow()` consulta as regras carregadas da organização **antes** de
  `suggestContact`/`suggestCategory` — uma correspondência aprendida é uma confirmação
  humana, tem prioridade sobre qualquer heurística.
- Regra aplicada aparece com o rótulo "contacto por regra" / "categoria por regra" na
  revisão, para ficar claro que não foi uma adivinha desta importação.

## Limitações conhecidas (para uma fase futura)

- As regras são específicas por `target_type`: uma regra de contacto aprendida ao
  importar transações não se aplica automaticamente a uma importação de faturas, ainda
  que seja conceptualmente o mesmo contacto. Simplificação deliberada — evita a
  complexidade de decidir quando uma regra "de contacto" deve ou não atravessar
  destinos diferentes; o utilizador pode voltar a carregar em "lembrar" em segundos.
- Sem interface própria para listar, editar ou apagar regras diretamente — só é
  possível criá-las (ou substituir o valor de uma existente, voltando a carregar em
  "lembrar" com uma escolha diferente). Uma página de gestão de regras fica para
  quando o volume de regras justificar o investimento.
- `match_value` é o texto exato da coluna de origem, não normalizado na tabela (a
  comparação é que normaliza em tempo de leitura) — duas grafias ligeiramente
  diferentes do mesmo fornecedor ("XYZ Lda" vs "XYZ, Lda.") continuam a exigir duas
  regras, porque a chave de unicidade é sobre o texto original.
