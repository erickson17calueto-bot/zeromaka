# Empréstimos/adiantamentos na importação

## O que existe

Na revisão de uma importação (`/app/importacoes`), uma linha de transação ganha um sinal visual — badge "parece empréstimo" — quando:

- é uma despesa (`direction = 'expense'`);
- a descrição contém "empréstimo" ou "adiantamento" (comparação sem acentos/maiúsculas); **e**
- o contacto resolvido para a linha é do tipo `funcionario` ou `ambos`.

Campo: `NormalizedRow.loan_hint` (boolean), calculado em `normalizeRow()`.

## O que NÃO existe (por desenho)

O `loan_hint` **não** muda o destino da linha (continua `target: "transaction"`), não pré-seleciona nenhuma categoria de empréstimo, e não publica nada como empréstimo automaticamente. A linha é importada como uma transação normal, como sempre.

Depois de importada, se o utilizador confirmar que é mesmo um empréstimo, usa **exatamente o mesmo fluxo de conversão de lançamentos antigos**: `/app/transacoes` → "Converter em empréstimo/adiantamento" (ver [LOAN-MIGRATION.md](./LOAN-MIGRATION.md)). Não há um caminho de importação separado — reaproveita a mesma RPC (`convert_entry_to_employee_loan`) e a mesma exigência de confirmação explícita do funcionário e do tipo.

## Porquê esta decisão

O motor de sugestões de importação (`lib/imports/suggest-category.ts`, `suggest-account.ts`, `row-kind.ts`, `duplicate-detection.ts`) é uma peça grande e já testada (83 cenários automatizados). Acrescentar-lhe um novo `TargetType` dedicado a empréstimos exigiria tocar em `detectRowKind`, no fluxo de publicação, e na reconciliação de duplicados — um raio de explosão bem maior do que o valor ganho, já que a conversão pós-importação cobre o mesmo caso de uso com o mesmo nível de segurança (nunca automático, sempre com o funcionário confirmado à mão).
