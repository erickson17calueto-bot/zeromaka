-- Achado de segurança à margem do pedido de empréstimos/requisições
-- (encontrado ao investigar a auditoria de approve_requisition): anon e
-- authenticated tinham GRANT direto de DELETE/TRUNCATE em journal_entries,
-- journal_lines e requisitions. Na prática já estava inofensivo (RLS não
-- tem política de DELETE nestas tabelas — nega por omissão; TRUNCATE não é
-- alcançável via PostgREST), mas viola o princípio do menor privilégio.
-- Mesmo padrão de limpeza já aplicado a financial_categories nesta sessão.

revoke delete, truncate on journal_entries from anon, authenticated;
revoke delete, truncate on journal_lines from anon, authenticated;
revoke delete on requisitions from anon;
revoke truncate on requisitions from anon, authenticated;
