-- CORREÇÃO CRÍTICA DE SEGURANÇA — vazamento de dados entre organizações
--
-- PROBLEMA
-- A view `obligation_status` pertence ao papel `postgres` e não tinha a opção
-- `security_invoker`. Em PostgreSQL, uma view sem essa opção executa com os
-- privilégios do DONO, ignorando por completo o Row Level Security das tabelas
-- base. Como a view tinha ainda GRANT para o papel `anon`, o resultado era:
--
--   qualquer pessoa na internet, usando apenas a chave pública `anon` (que está
--   no bundle JavaScript de qualquer visitante do site), conseguia ler as
--   obrigações financeiras — números de documento, valores, contactos, datas —
--   de TODAS as organizações, com um simples
--   GET /rest/v1/obligation_status
--
-- Confirmado empiricamente antes da correção: HTTP 200 devolvia 14 linhas de 4
-- organizações distintas, ~9.070.000 Kz em valores, sem qualquer autenticação.
-- A tabela base `financial_obligations` estava (e está) corretamente protegida
-- — devolvia 401. O buraco era exclusivamente a view.
--
-- CORREÇÃO
-- `security_invoker = on` (Postgres 15+) faz a view respeitar o RLS de QUEM a
-- consulta, que é o comportamento sempre pretendido. Verificado depois de
-- aplicar: `anon` passa a receber 401; um membro legítimo continua a ver
-- exatamente as linhas da sua organização e mais nenhuma.
--
-- O REVOKE é defesa em profundidade: sem ele, bastaria alguém desligar o
-- security_invoker por engano numa alteração futura para o vazamento voltar.

alter view public.obligation_status set (security_invoker = on);

revoke all on public.obligation_status from anon;
