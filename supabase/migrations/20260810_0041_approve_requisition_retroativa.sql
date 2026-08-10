-- Migração retroativa: versiona approve_requisition no estado ATUAL, antes
-- de qualquer alteração desta fase — preserva histórico de "como estava"
-- (aprova e desembolsa sempre no mesmo passo, sem p_disburse, sem
-- SECURITY DEFINER). A migração seguinte desta fase substitui esta função
-- para separar aprovar de desembolsar.

create or replace function public.approve_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_req record; v_uid uuid := auth.uid();
  v_eid uuid := gen_random_uuid(); v_num text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_org_id NOT IN (SELECT user_writable_org_ids()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_req FROM requisitions WHERE id = p_req_id AND organization_id = p_org_id;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Requisição não encontrada'; END IF;
  IF v_req.status != 'pendente' THEN RAISE EXCEPTION 'Requisição não está pendente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND organization_id = p_org_id AND NOT is_archived) THEN RAISE EXCEPTION 'Conta inválida ou arquivada'; END IF;
  v_num := next_entry_number(p_org_id, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  INSERT INTO journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, idempotency_key, created_by, metadata)
  VALUES (v_eid, p_org_id, v_num, 'expense', CURRENT_DATE, 'Requisição ' || v_req.number || ' — ' || left(v_req.purpose, 40), 'requisition', gen_random_uuid(), v_uid, jsonb_build_object('requisition_id', p_req_id));
  INSERT INTO journal_lines (organization_id, journal_entry_id, account_id, direction, amount) VALUES (p_org_id, v_eid, p_account_id, 'credit', v_req.amount);
  UPDATE requisitions SET status = 'aprovado', account_id = p_account_id, decided_at = now() WHERE id = p_req_id;
END; $function$;
