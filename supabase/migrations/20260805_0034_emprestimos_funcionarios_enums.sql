-- Empréstimos e adiantamentos salariais a funcionários — parte 1: valores de
-- enum. Em migração própria de propósito: o Postgres não deixa usar um valor
-- de enum acabado de adicionar na MESMA transação em que foi criado (ALTER
-- TYPE ... ADD VALUE só fica disponível depois de committar). A parte 2
-- (20260805_0035) já pode usar 'funcionario'/'employee_loan'/'salary_advance'
-- livremente.

alter type public.contact_kind add value if not exists 'funcionario';
alter type public.obligation_document_kind add value if not exists 'employee_loan';
alter type public.obligation_document_kind add value if not exists 'salary_advance';
