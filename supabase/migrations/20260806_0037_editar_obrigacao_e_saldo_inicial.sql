-- Fase 1 do pedido de melhorias em contas a receber/pagar:
-- (a) update_obligation: já existe trg_obligations_audit (AFTER UPDATE ON
--     financial_obligations -> audit_financial_change()) que regista old/new
--     automaticamente — confirmado ao vivo (contagem de audit_logs subiu com
--     uma chamada normal, sem nenhuma alteração nesta função). Não precisa de
--     nenhuma alteração; o pedido do master prompt já estava satisfeito.
-- (b) nova função update_account_opening_balance, restrita a owner/admin da
--     organização, para corrigir o saldo inicial de uma conta. accounts já
--     tem trg_audit_accounts (mesmo mecanismo genérico), por isso a linha
--     accounts.initial_balance fica coberta automaticamente. journal_lines só
--     audita INSERT, não UPDATE — por isso a correção da linha em si (o que
--     interessa de verdade: o valor do lançamento de abertura) precisa de um
--     registo manual, que também guarda o motivo (p_reason), inexistente como
--     coluna em qualquer tabela.

create or replace function public.update_obligation(p_obligation_id uuid, p_contact_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_external_document_number text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_issue_date date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_category_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_o record; v_paid numeric; v_new_issue date; v_new_due date; v_new_amount numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_o from financial_obligations where id = p_obligation_id;
  if v_o.id is null then raise exception 'Obrigação não encontrada'; end if;
  if v_o.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if v_o.lifecycle_status <> 'open' then raise exception 'Obrigação cancelada não pode ser alterada'; end if;
  select coalesce(sum(a.allocated_amount), 0) into v_paid from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted' where a.obligation_id = p_obligation_id;
  v_new_amount := coalesce(p_amount, v_o.original_amount);
  v_new_issue := coalesce(p_issue_date, v_o.issue_date);
  v_new_due := coalesce(p_due_date, v_o.due_date);
  if v_paid > 0 then
    if p_amount is not null and p_amount < v_paid then raise exception 'Valor não pode ser inferior ao já pago (%)', v_paid; end if;
    if p_contact_id is not null and p_contact_id <> v_o.contact_id then raise exception 'Não é possível trocar o contacto após pagamentos'; end if;
  end if;
  if p_contact_id is not null and not exists (select 1 from contacts where id = p_contact_id and organization_id = v_o.organization_id) then raise exception 'Contacto inválido'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = v_o.organization_id) then raise exception 'Categoria inválida'; end if;
  if v_new_due < v_new_issue then raise exception 'Vencimento não pode ser anterior à emissão'; end if;
  if v_new_amount <= 0 then raise exception 'Valor deve ser positivo'; end if;

  update financial_obligations set
    contact_id = coalesce(p_contact_id, contact_id),
    description = coalesce(p_description, description),
    external_document_number = coalesce(p_external_document_number, external_document_number),
    original_amount = v_new_amount,
    issue_date = v_new_issue,
    due_date = v_new_due,
    category_id = coalesce(p_category_id, category_id),
    notes = coalesce(p_notes, notes)
  where id = p_obligation_id;

  return json_build_object('id', p_obligation_id, 'updated', true);
end; $function$;

create or replace function public.update_account_opening_balance(
  p_account_id uuid, p_new_amount numeric, p_reason text
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_acc record;
  v_entry record;
  v_eid uuid;
  v_num text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_acc from accounts where id = p_account_id;
  if v_acc.id is null then raise exception 'Conta não encontrada'; end if;
  if v_acc.organization_id not in (select user_admin_org_ids()) then
    raise exception 'Só o dono ou administrador da organização pode corrigir o saldo inicial';
  end if;
  if p_new_amount is null or p_new_amount <= 0 then raise exception 'O saldo inicial tem de ser positivo'; end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'Indica o motivo da correção'; end if;

  -- O opening_balance 'posted' mais recente é a data-base do saldo atual (ver
  -- current_account_balance) — é sempre esse que se corrige, nunca um
  -- lançamento antigo que já foi substituído por um mais recente.
  select je.id as entry_id, jl.id as line_id, jl.amount as line_amount into v_entry
  from journal_entries je
  join journal_lines jl on jl.journal_entry_id = je.id and jl.account_id = p_account_id
  where je.entry_type = 'opening_balance' and je.status = 'posted' and je.organization_id = v_acc.organization_id
  order by je.transaction_date desc, je.posted_at desc, je.created_at desc, je.id desc
  limit 1;

  if v_entry.entry_id is not null then
    -- journal_lines só audita INSERT via trigger (trg_audit_journal_lines),
    -- não UPDATE — por isso este UPDATE precisa de registo manual.
    update journal_lines set amount = p_new_amount where id = v_entry.line_id;
    insert into audit_logs (organization_id, user_id, table_name, record_id, action, old_data, new_data)
    values (v_acc.organization_id, v_uid, 'journal_lines', v_entry.line_id, 'UPDATE',
      jsonb_build_object('amount', v_entry.line_amount),
      jsonb_build_object('amount', p_new_amount, 'reason', p_reason, 'entry_id', v_entry.entry_id));
  else
    -- Conta nunca teve opening_balance (foi criada com saldo 0) — cria um
    -- agora, datado de hoje, tal como create_account_with_balance faria. O
    -- INSERT em journal_entries/journal_lines já é auditado automaticamente
    -- pelos triggers genéricos (trg_audit_journal_entries/_lines); o registo
    -- manual aqui serve só para guardar o motivo (p_reason), que não é
    -- coluna de nenhuma das duas tabelas.
    v_eid := gen_random_uuid();
    v_num := next_entry_number(v_acc.organization_id, extract(year from current_date)::int);
    insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, idempotency_key, created_by)
    values (v_eid, v_acc.organization_id, v_num, 'opening_balance', current_date, 'Saldo inicial — ' || v_acc.name, 'manual', gen_random_uuid(), v_uid);
    insert into journal_lines (id, organization_id, journal_entry_id, account_id, direction, amount)
    values (gen_random_uuid(), v_acc.organization_id, v_eid, p_account_id, 'debit', p_new_amount)
    returning id into v_entry;
    insert into audit_logs (organization_id, user_id, table_name, record_id, action, old_data, new_data)
    values (v_acc.organization_id, v_uid, 'journal_lines', v_entry.id, 'INSERT',
      jsonb_build_object('amount', 0),
      jsonb_build_object('amount', p_new_amount, 'reason', p_reason, 'entry_id', v_eid));
  end if;

  -- Mantém a coluna legada em sincronia — nunca é lida para calcular saldo
  -- (ver docs/005-financial-engine.md), mas continua a ser o rótulo "Inicial"
  -- mostrado em Contas. Esta UPDATE já é auditada automaticamente por
  -- trg_audit_accounts (mesmo mecanismo genérico) — não duplicar aqui.
  update accounts set initial_balance = p_new_amount, updated_at = now() where id = p_account_id;

  return json_build_object('id', p_account_id, 'new_amount', p_new_amount);
end; $$;

revoke all on function public.update_account_opening_balance(uuid, numeric, text) from public, anon;
grant execute on function public.update_account_opening_balance(uuid, numeric, text) to authenticated;
