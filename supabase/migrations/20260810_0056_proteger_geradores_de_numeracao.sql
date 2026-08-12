-- CORREÇÃO — geradores de numeração sem verificação de organização
--
-- next_entry_number e next_document_number são SECURITY DEFINER (escrevem nas
-- tabelas de sequência, cujo RLS está ativo mas sem políticas) e NÃO
-- verificavam nem autenticação nem a organização recebida em p_org_id.
--
-- Provado: um utilizador com papel 'member' de uma organização de teste
-- chamou next_entry_number com o id da CHEAR INVESTIMENT e obteve
-- MOV-2026-000173 — organização de que não é membro. Duas fugas ao mesmo
-- tempo:
--   * ESCRITA: incrementa o contador de outra empresa; os lançamentos
--     seguintes da vítima passam a ter saltos na numeração. Numeração
--     sequencial sem falhas é requisito de documentos fiscais em Angola, por
--     isso isto é um problema de conformidade, não só cosmético. Em ciclo,
--     esgota a sequência (negação de serviço da numeração).
--   * LEITURA: o número devolvido revela quantos lançamentos a vítima já fez
--     no ano — métrica de negócio exposta a um concorrente.
--
-- O vetor anónimo já tinha sido fechado em 20260810_0053 (revogação do EXECUTE
-- a anon); isto fecha o vetor de utilizador autenticado.
--
-- Todos os chamadores internos passam na nova verificação: post_income,
-- post_expense, post_transfer, post_opening_balance, create_account_with_balance,
-- grant_employee_loan, post_settlement, reverse_journal_entry,
-- update_account_opening_balance e _disburse_requisition_ledger validam a
-- organização (writable, ou admin que é subconjunto de writable) ANTES de
-- pedirem o número.

create or replace function public.next_entry_number(p_org_id uuid, p_year integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_num int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_org_id NOT IN (SELECT public.user_writable_org_ids()) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização';
  END IF;
  INSERT INTO public.journal_entry_sequences (organization_id, year, last_number)
  VALUES (p_org_id, p_year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_number = public.journal_entry_sequences.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN 'MOV-' || p_year || '-' || lpad(v_num::text, 6, '0');
END; $function$;

create or replace function public.next_document_number(p_org_id uuid, p_prefix text, p_year integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_num int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select public.user_writable_org_ids()) then
    raise exception 'Sem permissão para esta organização';
  end if;
  insert into public.document_number_sequences (organization_id, prefix, year, last_number)
  values (p_org_id, p_prefix, p_year, 1)
  on conflict (organization_id, prefix, year)
  do update set last_number = public.document_number_sequences.last_number + 1
  returning last_number into v_num;
  return p_prefix || '-' || p_year || '-' || lpad(v_num::text, 6, '0');
end; $function$;

-- VERIFICADO depois de aplicar: um 'member' a tentar a organização real é
-- bloqueado com "Sem permissão para esta organização" e a sequência da CHEAR
-- mantém-se em 172.
