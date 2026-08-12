-- CORREÇÃO — search_path hijacking via pg_temp em funções SECURITY DEFINER
--
-- PROBLEMA (confirmado empiricamente)
-- Em PostgreSQL, o schema temporário (pg_temp) é pesquisado IMPLICITAMENTE
-- ANTES de tudo o resto quando não está listado no search_path. Cerca de 30
-- funções SECURITY DEFINER tinham `SET search_path = public` e referiam as
-- tabelas sem qualificar o schema (ex: `from companies`, não
-- `from public.companies`).
--
-- Resultado: qualquer utilizador autenticado podia criar uma tabela
-- TEMPORÁRIA com o nome de uma tabela real, e a função SECURITY DEFINER —
-- que corre com os privilégios do dono, não do chamador — passava a ler os
-- dados falsos do atacante em vez dos reais.
--
-- PROVA (organização real, regime 'isencao' = 1%):
--   org_sale_tax(org, 1.000.000) legítimo ................ 10.000,00
--   depois de `create temp table companies` com 'geral' ... 122.807,02
-- A função usou a tabela do atacante. O mesmo vetor aplicava-se às validações
-- internas das funções financeiras (contas, contactos, categorias,
-- obrigações), que podiam ser contornadas com tabelas temporárias forjadas —
-- por exemplo, fazer passar a verificação "este contacto é funcionário" ou
-- "esta conta pertence à organização".
--
-- NOTA: as funções com `search_path = ''` NÃO estavam afetadas — qualificam
-- todos os nomes como public.xxx, por isso não há nada a sombrear. É por isso
-- que user_org_ids/user_writable_org_ids/user_admin_org_ids (as verificações
-- de autorização) se mantiveram fiáveis mesmo com este problema em aberto.
--
-- CORREÇÃO
-- Acrescentar `pg_temp` explicitamente NO FIM do search_path. Ao ser nomeado,
-- deixa de ser pesquisado implicitamente primeiro e passa a ser pesquisado
-- por último — as tabelas reais de public voltam a ganhar. Não altera a
-- lógica de nenhuma função, apenas a resolução de nomes.
--
-- VERIFICADO depois de aplicar: o mesmo ataque devolve 10.000,00 (valor real)
-- e a contagem de funções SECURITY DEFINER ainda vulneráveis é 0.

do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proconfig::text like '%search_path=public%'
      and p.proconfig::text not like '%pg_temp%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path corrigido em % funcoes', n;
end $$;
