-- Fase 1 do pedido de empréstimos/requisições: novos tipos de lançamento
-- não-operacionais para desembolso e devolução de empréstimo/adiantamento.
-- Precisam de ficar fora de ('income','expense') para não entrarem na
-- DRE (que só soma esses dois tipos) nem inflacionarem despesas/receitas
-- operacionais — o desembolso de um empréstimo não é despesa, é troca de
-- ativo (caixa por um valor a receber do funcionário); a devolução não é
-- receita, é a troca inversa.
--
-- Regra de enums do projeto: ALTER TYPE ... ADD VALUE não pode correr na
-- mesma transação que código que USA o valor novo — por isso esta migração
-- só adiciona os valores; a próxima consome-os.

alter type journal_entry_type add value if not exists 'loan_disbursement';
alter type journal_entry_type add value if not exists 'salary_advance_disbursement';
alter type journal_entry_type add value if not exists 'loan_repayment';
alter type journal_entry_type add value if not exists 'salary_advance_repayment';
