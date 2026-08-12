-- CORREÇÃO CRÍTICA — escrita cross-tenant e fabricação de saldos no razão
--
-- PROBLEMA (confirmado empiricamente, dentro de BEGIN...ROLLBACK)
-- `authenticated` tinha GRANT de INSERT/UPDATE direto em journal_entries e
-- journal_lines, e as policies só validavam a COLUNA organization_id da linha
-- — nunca a organização DONA da conta referenciada em account_id (a FK aponta
-- para accounts(id), sem organization_id).
--
-- Consequências provadas:
--   1. CROSS-TENANT: um utilizador inseriu uma linha contra uma conta de OUTRA
--      organização e mudou-lhe o saldo de 0,00 para -500.000,00 — sem sequer
--      conseguir LER essa conta (o RLS de SELECT funcionava; o de INSERT não
--      protegia nada). Sabotagem financeira entre clientes do mesmo SaaS.
--   2. FABRICAÇÃO DE SALDO: um INSERT direto com uma única linha de débito e
--      sem contrapartida levou um saldo de 21.699 para 1.000.021.698 numa só
--      chamada, contornando TODAS as validações de post_income (permissão,
--      valor positivo, conta válida/não arquivada, categoria, contacto,
--      idempotência).
--
-- Qualquer pessoa registada conseguia chegar aqui: bastava criar a sua própria
-- organização (ficando em user_writable_org_ids) e falar diretamente com o
-- PostgREST, que expõe estas tabelas ao JWT do browser.
--
-- CORREÇÃO — o razão passa a ser escrito EXCLUSIVAMENTE por RPC.
--
-- Deliberadamente NÃO se usa um trigger de partidas dobradas: 194 dos 200
-- lançamentos existentes não são balanceados por desenho (o modelo é de
-- partida simples sobre contas de tesouraria), por isso um trigger desses
-- partiria o histórico inteiro.
--
-- Passo 1: os 6 RPCs que escrevem no razão eram SECURITY INVOKER, ou seja
-- dependiam do GRANT de `authenticated` para escrever. Passam a
-- SECURITY DEFINER para continuarem a funcionar depois de revogarmos o grant.
-- Todos já validam a organização (user_writable_org_ids / user_admin_org_ids)
-- E que a conta indicada pertence a essa organização — verificado um a um
-- antes desta conversão. Levam search_path = public, pg_temp para não ficarem
-- expostos ao hijacking corrigido em 20260810_0054.

alter function public.post_income(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb, entry_document_kind, text, date, text)
  security definer set search_path = public, pg_temp;
alter function public.post_expense(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb, entry_document_kind, text, date, text)
  security definer set search_path = public, pg_temp;
alter function public.post_transfer(uuid, uuid, uuid, numeric, text, date, uuid)
  security definer set search_path = public, pg_temp;
alter function public.post_opening_balance(uuid, uuid, numeric, date, uuid)
  security definer set search_path = public, pg_temp;
alter function public.reverse_journal_entry(uuid, text)
  security definer set search_path = public, pg_temp;
alter function public.create_account_with_balance(uuid, uuid, text, account_type, text, numeric, uuid, date)
  security definer set search_path = public, pg_temp;

-- Passo 2: fechar a escrita direta. O frontend só faz SELECT a estas tabelas
-- (confirmado: lib/store.tsx linhas 461, 535, 578 são todas .select()).
revoke insert, update, delete on public.journal_entries from authenticated;
revoke insert, update, delete on public.journal_lines from authenticated;

-- Passo 3: remover as policies de escrita, agora inalcançáveis e que davam a
-- impressão falsa de que a escrita direta estava protegida.
drop policy if exists "Writers can insert entries" on public.journal_entries;
drop policy if exists "Writers can update entries" on public.journal_entries;
drop policy if exists "Writers can insert lines" on public.journal_lines;

-- VERIFICADO depois de aplicar:
--   INSERT direto como authenticated ....... permission denied
--   post_income / post_expense / post_transfer ... funcionam (MOV-2026-000021/22/23)
--   post_income com conta de OUTRA org ..... "Conta inválida ou arquivada"
--   saldos reais e contagem de lançamentos . inalterados
