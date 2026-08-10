-- Permite escolher a data do saldo inicial ao criar uma conta (em vez de
-- assumir sempre "hoje"). A data escolhida vira a transaction_date do
-- lançamento opening_balance, que é a "data-base" usada por
-- current_account_balance() — por isso não pode ser no futuro (isso deixaria
-- a janela [data-base, hoje] vazia e o saldo parado no valor de abertura).
-- Numeração do lançamento segue o ano da data escolhida, tal como
-- post_income/post_expense/post_settlement já fazem com as suas datas.

drop function if exists public.create_account_with_balance(uuid, uuid, text, account_type, text, numeric, uuid);

create or replace function public.create_account_with_balance(
  p_org_id uuid, p_id uuid, p_name text, p_type account_type,
  p_bank text DEFAULT NULL::text, p_initial_balance numeric DEFAULT 0,
  p_idempotency_key uuid DEFAULT NULL::uuid, p_opening_date date DEFAULT CURRENT_DATE
)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_eid uuid; v_num text;
  v_idem uuid := COALESCE(p_idempotency_key, gen_random_uuid());
  v_date date := COALESCE(p_opening_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_org_id NOT IN (SELECT user_writable_org_ids()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_date > CURRENT_DATE THEN RAISE EXCEPTION 'A data do saldo inicial não pode ser no futuro'; END IF;
  INSERT INTO accounts (id, organization_id, name, type, bank, initial_balance, currency) VALUES (p_id, p_org_id, p_name, p_type, p_bank, p_initial_balance, 'AOA');
  IF p_initial_balance > 0 THEN
    v_eid := gen_random_uuid();
    v_num := next_entry_number(p_org_id, EXTRACT(YEAR FROM v_date)::int);
    INSERT INTO journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, idempotency_key, created_by) VALUES (v_eid, p_org_id, v_num, 'opening_balance', v_date, 'Saldo inicial — ' || p_name, 'system', v_idem, v_uid);
    INSERT INTO journal_lines (organization_id, journal_entry_id, account_id, direction, amount) VALUES (p_org_id, v_eid, p_id, 'debit', p_initial_balance);
  END IF;
  RETURN json_build_object('id', p_id, 'entry_id', v_eid, 'entry_number', v_num);
END; $function$;
