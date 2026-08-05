Data: 2026-08-05 · Fases 1 e 2 do overhaul de importação (`app/app/importacoes/page.tsx`)

## Objetivo

Importar um extrato bancário, diário de caixa ou lista de faturas real — em formato
imprevisível, com colunas em português informal, datas em vários formatos, valores em
vírgula decimal — sem lançar nada automaticamente sem revisão humana. Nada é escrito no
livro (`journal_entries`/`journal_lines`) ou em `financial_obligations` antes de o
utilizador aprovar linha a linha (ou em massa) e carregar em "Lançar aprovadas".

## Pipeline

1. **Upload** (`app/api/imports/parse/route.ts`): decide o formato (xlsx/csv/pdf),
   deteta a codificação (UTF-8 vs Windows-1252), encontra a linha de cabeçalho real
   (`lib/imports/header-row.ts` — ignora títulos e totais soltos antes da tabela) e,
   para livros Excel com várias folhas, deixa escolher qual ler.
2. **Normalização** (`normalizeRow` em `page.tsx`): cada linha crua passa por:
   - deteção de linha de controlo (`lib/imports/row-kind.ts`) — "fecho da semana",
     "saldo inicial/final", "reconciliação" nunca viram um movimento;
   - conflito descrição × coluna (a descrição diz "entrada" mas o valor caiu na coluna
     de saída, ou vice-versa) — bloqueia aprovação automática até correção manual;
   - sugestão de conta (`lib/imports/suggest-account.ts`), categoria com subcategoria
     (`lib/imports/suggest-category.ts`) e contacto (`lib/imports/suggest-contact.ts`,
     ver secção própria abaixo);
   - regras aprendidas (`import_mapping_rules`, ver `docs/IMPORT-MAPPING-RULES.md`) —
     consultadas antes de qualquer sugestão automática.
3. **Reconciliação de saldo** (item B, `lib/imports/balance-reconciliation.ts`): quando
   o ficheiro tem coluna SALDO, cada linha é comparada com o saldo calculado a partir
   dos próprios movimentos, na ordem do ficheiro — sinaliza reconciliado / diferença
   pequena / diferença relevante / impossível verificar. O SALDO nunca é lançado como
   transação, só usado para conferência.
4. **Duplicados em níveis** (`lib/imports/duplicate-detection.ts`): confirmado (mesma
   referência de documento), provável (mesma data+valor+direção+conta+contacto) ou
   possível (mesma data+valor+descrição parecida) — comparando tanto entre linhas do
   próprio ficheiro como contra lançamentos/obrigações já existentes na organização. O
   painel de duplicados mostra o lançamento original ao lado do importado.
5. **Aviso de reimportação** (item J): se um ficheiro com o mesmo nome e número de
   linhas já foi importado para o mesmo destino, avisa antes de continuar — não
   bloqueia, é só para revisão consciente.
6. **Revisão**: tabela com pesquisa por texto, paginação (100 linhas por página),
   filtros (válidas/duplicadas/com erro/eliminadas), seleção múltipla com ações em
   massa (aprovar, eliminar, aplicar categoria), e edição linha a linha.
7. **Aprovação e lançamento**: só linhas com `decision = 'keep'` e `validation_status =
   'ready'` são elegíveis. "Lançar aprovadas" pede confirmação explícita (mostra a
   organização de destino) e chama `apply_import_row` por linha — a mesma RPC que
   `post_income`/`post_expense`/`create_financial_obligation` usam para qualquer outro
   lançamento manual.

## Correspondência de contactos (item H)

`suggestContact()` tenta, por ordem de confiança:

1. **NIF** — comparado por dígitos+letras (sem pontuação/espaços), nunca só dígitos:
   um BI angolano mistura letras e números, e descartar as letras arriscaria confundir
   pessoas diferentes.
2. **Telefone/WhatsApp** — só dígitos, tolerando indicativo internacional de
   comprimento diferente (compara por sufixo, mínimo 7 dígitos).
3. **Nome exato**, normalizado (sem acentos/maiúsculas).
4. **Nome aproximado** — só quando as palavras significativas de um nome (ignorando
   "Lda", "Comércio", etc.) estão totalmente contidas no outro, E só há um candidato
   possível. Com ambiguidade (duas empresas "XYZ", por exemplo), não escolhe nenhuma.

Um contacto encontrado por nome aproximado aparece com o rótulo "contacto aproximado"
na revisão — é a única variante que vale a pena confirmar antes de aprovar; NIF,
telefone e nome exato são suficientemente inequívocos para não precisarem do aviso.

## Referência do documento (item G)

Para transações, o número de fatura/documento do ficheiro é guardado em
`normalized_data.reference` e viaja até ao lançamento: `apply_import_row` passa
`p_reference` a `post_income`/`post_expense`, que já aceitavam este parâmetro mas nunca
o recebiam desta chamada.

## O que fica por fazer

- **Assistente de 10 etapas**: a página de revisão atual (upload → tabela única com
  filtros/pesquisa/paginação/ações em massa) cobre o mesmo terreno funcional sem
  reformular a interface. Um assistente passo-a-passo é uma mudança de UX maior,
  fica para quando houver confirmação explícita sobre a forma exata.
- Os restantes documentos previstos no pedido original (`IMPORT-SECURITY.md`,
  `IMPORT-TESTING.md`, etc.) não foram criados como ficheiros separados — o conteúdo
  relevante está distribuído por este documento, por `docs/IMPORT-MAPPING-RULES.md` e
  pelos comentários nos próprios módulos (`lib/imports/*.ts`), que é onde a maior parte
  do código deste projeto já documenta as suas próprias regras.
