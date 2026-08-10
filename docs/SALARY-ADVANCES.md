# Adiantamentos salariais

Mecanicamente idênticos a um [empréstimo a funcionário](./EMPLOYEE-LOANS.md) — mesma RPC (`grant_employee_loan`), mesmo fluxo de requisição, mesma reconciliação de registos antigos, mesmas regras de duplicados. Só muda:

- `document_kind = 'salary_advance'` em vez de `'employee_loan'`.
- Entry types dedicados: `salary_advance_disbursement` / `salary_advance_repayment` em vez de `loan_disbursement` / `loan_repayment` — mesmo efeito no caixa e na exclusão da DRE, só o rótulo e a categoria interna mudam.
- Categoria seed sugerida: "Adiantamentos salariais" (em vez de "Empréstimos a funcionários"), ambas sob "Pessoal".
- No campo `recovery_method` da requisição, o valor típico é `salary_deduction` — mas, como documentado em [LOAN-ACCOUNTING.md](./LOAN-ACCOUNTING.md), não há motor de folha nesta versão: a liquidação continua a ser sempre um registo manual de devolução.

Tudo o resto (conceder, devolver, reconciliar registos antigos, prevenção de duplicados, relatório de posição) é exatamente o mesmo fluxo, só filtrado por tipo.
