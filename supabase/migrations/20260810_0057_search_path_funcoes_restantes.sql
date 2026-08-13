-- Completa a correção de search_path iniciada em 20260810_0054.
--
-- Essa migração apanhou as funções com `SET search_path = public`. Ficaram de
-- fora 7 que não tinham `SET search_path` NENHUM, e que por isso resolvem
-- nomes pelo search_path da sessão — com pg_temp implicitamente à frente.
-- Foram encontradas ao reexecutar os advisors do Supabase depois das
-- correções (7 alertas function_search_path_mutable).
--
-- RISCO REAL: baixo, e bastante menor do que o das corrigidas em 0054. Todas
-- as 7 são SECURITY INVOKER — correm com os privilégios de quem chama — por
-- isso sombrear uma tabela com pg_temp não dá acesso a nada que o atacante já
-- não tivesse. Não há escalada de privilégios nem travessia entre
-- organizações. Duas ressalvas que justificam corrigir na mesma:
--   * validate_financial_category é um trigger de validação de integridade;
--     sem search_path fixo, a verificação podia ser contornada.
--   * current_account_balance é o cálculo de saldo usado em toda a aplicação;
--     deve ser determinístico quanto às tabelas que lê.
--
-- Acrescentar `pg_temp` no fim não altera a resolução normal (public continua
-- a ser pesquisado primeiro), apenas retira o pg_temp da frente.
--
-- VERIFICADO: os saldos reais da organização de produção são idênticos antes
-- e depois (48.120,00 e 4.776.667,64).

alter function public.current_account_balance(uuid) set search_path = public, pg_temp;
alter function public.get_account_balances(uuid) set search_path = public, pg_temp;
alter function public.get_financial_summary(uuid, date, date) set search_path = public, pg_temp;
alter function public.get_true_available_cash(uuid, integer, uuid) set search_path = public, pg_temp;
alter function public.seed_default_categories(uuid) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.validate_financial_category() set search_path = public, pg_temp;

-- Resíduo da limpeza de privilégios em 20260810_0053: document_number_sequences
-- ficou sem grants nenhuns (correto), mas journal_entry_sequences manteve
-- INSERT/SELECT/UPDATE/DELETE para `authenticated`.
--
-- Não havia fuga — a tabela tem RLS ativo e zero políticas, portanto nega tudo
-- por omissão. Mas o privilégio era desnecessário: o único acesso legítimo é
-- através de next_entry_number(), que é SECURITY DEFINER e desde 20260810_0056
-- valida a organização. Uniformiza as duas tabelas de sequência no mesmo
-- estado: sem acesso direto de ninguém.
--
-- VERIFICADO: post_income continua a funcionar depois da revogação
-- (devolveu MOV-2026-000025), porque a numeração passa pela função e não pela
-- tabela.

revoke all on public.journal_entry_sequences from authenticated, anon;
