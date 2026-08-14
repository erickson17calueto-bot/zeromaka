-- Painel de Grupo: resumo financeiro de cada empresa a que o utilizador
-- pertence, para comparar saldo/resultado/pendências lado a lado sem entrar
-- em cada uma. Não é um super-admin cross-tenant: cada chamada só devolve
-- dados da organização pedida, e só se o chamador for membro dela (RLS das
-- tabelas base decide isso, ver nota abaixo).
--
-- Desenho deliberado, para não repetir erros já cometidos noutras funções:
--   * NÃO reaproveita get_account_balances() — essa função soma
--     journal_lines em bruto, ignorando a data-base do saldo inicial
--     (ver docs/005-financial-engine.md). Dava números errados.
--   * O saldo replica o padrão CORRETO já usado em get_true_available_cash:
--     somar current_account_balance(a.id) por conta não arquivada.
--   * Rendimento/despesa replica a lógica de get_financial_summary,
--     incluindo a exclusão de capital_in/capital_out (não são resultado).
--   * A receber/a pagar lê obligation_status, que desde 20260810_0051 tem
--     security_invoker = on — já não faz sentido continuar vulnerável a
--     bypass de RLS.
--   * Deliberadamente SEM SECURITY DEFINER, tal como get_account_balances e
--     get_financial_summary: corre com os privilégios de quem chama, e o
--     RLS de accounts/journal_entries/obligation_status é que garante que
--     uma organização a que o chamador não pertence devolve zeros — não
--     um erro nem dados de outrem. Testado ao vivo antes desta migração.
create or replace function public.get_org_snapshot(p_org_id uuid, p_month_start date, p_month_end date)
 returns json
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_balance numeric(20,2);
  v_income numeric(20,2);
  v_expense numeric(20,2);
  v_receivable numeric(20,2);
  v_payable numeric(20,2);
begin
  select coalesce(sum(public.current_account_balance(a.id)), 0)::numeric(20,2)
    into v_balance
  from accounts a
  where a.organization_id = p_org_id and not a.is_archived;

  select
    coalesce(sum(jl.amount) filter (where je.entry_type = 'income' and (je.metadata->>'type') is distinct from 'capital_in'), 0)::numeric(20,2),
    coalesce(sum(jl.amount) filter (where je.entry_type = 'expense' and (je.metadata->>'type') is distinct from 'capital_out'), 0)::numeric(20,2)
    into v_income, v_expense
  from journal_lines jl
  join journal_entries je on je.id = jl.journal_entry_id
  where je.organization_id = p_org_id
    and je.status = 'posted'
    and je.entry_type in ('income', 'expense')
    and je.transaction_date between p_month_start and p_month_end;

  select
    coalesce(sum(outstanding_amount) filter (where direction = 'receivable'), 0)::numeric(20,2),
    coalesce(sum(outstanding_amount) filter (where direction = 'payable'), 0)::numeric(20,2)
    into v_receivable, v_payable
  from obligation_status
  where organization_id = p_org_id and lifecycle_status = 'open';

  return json_build_object(
    'balance', v_balance,
    'income', v_income,
    'expense', v_expense,
    'result', v_income - v_expense,
    'receivable_open', v_receivable,
    'payable_open', v_payable
  );
end;
$function$;

revoke all on function public.get_org_snapshot(uuid, date, date) from public, anon;
grant execute on function public.get_org_snapshot(uuid, date, date) to authenticated;

-- VERIFICADO ao vivo antes de escrever este ficheiro:
--   1. Saldo devolvido bate com a soma manual de current_account_balance()
--      para uma organização real (CHEAR INVESTIMENT): 4.848.787,64 = 4.848.787,64.
--   2. Chamar com uma organização a que o utilizador não pertence devolve
--      todos os campos a zero — não erro, não dados de outra empresa.
--   3. Repetido com sucesso para uma organização de teste com dados
--      conhecidos (Test Org F): 21.999,00 = 21.999,00.
