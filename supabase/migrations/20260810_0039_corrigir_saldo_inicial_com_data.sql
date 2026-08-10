-- Estende a correção de saldo inicial (admin/owner) para também poder mudar
-- a data em que esse saldo foi registado, não só o valor — pedido explícito
-- do utilizador depois de descobrir que só dava para escolher a data ao
-- CRIAR a conta, não em contas já existentes. Sem p_new_date, a data
-- mantém-se como estava (compatível com quem só quer corrigir o valor).

drop function if exists public.update_account_opening_balance(uuid, numeric, text);

create or replace function public.update_account_opening_balance(
  p_account_id uuid, p_new_amount numeric, p_reason text, p_new_date date DEFAULT NULL::date
) returns json
language plpgsql security definer set search_path = 'public'
as $function$
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
  if p_new_date is not null and p_new_date > current_date then raise exception 'A data do saldo inicial não pode ser no futuro'; end if;

  select je.id as entry_id, jl.id as line_id, jl.amount as line_amount, je.transaction_date as entry_date into v_entry
  from journal_entries je
  join journal_lines jl on jl.journal_entry_id = je.id and jl.account_id = p_account_id
  where je.entry_type = 'opening_balance' and je.status = 'posted' and je.organization_id = v_acc.organization_id
  order by je.transaction_date desc, je.posted_at desc, je.created_at desc, je.id desc
  limit 1;

  if v_entry.entry_id is not null then
    update journal_lines set amount = p_new_amount where id = v_entry.line_id;
    if p_new_date is not null and p_new_date <> v_entry.entry_date then
      update journal_entries set transaction_date = p_new_date where id = v_entry.entry_id;
    end if;
    insert into audit_logs (organization_id, user_id, table_name, record_id, action, old_data, new_data)
    values (v_acc.organization_id, v_uid, 'journal_lines', v_entry.line_id, 'UPDATE',
      jsonb_build_object('amount', v_entry.line_amount, 'date', v_entry.entry_date),
      jsonb_build_object('amount', p_new_amount, 'date', coalesce(p_new_date, v_entry.entry_date), 'reason', p_reason, 'entry_id', v_entry.entry_id));
  else
    v_eid := gen_random_uuid();
    v_num := next_entry_number(v_acc.organization_id, extract(year from coalesce(p_new_date, current_date))::int);
    insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, source, idempotency_key, created_by)
    values (v_eid, v_acc.organization_id, v_num, 'opening_balance', coalesce(p_new_date, current_date), 'Saldo inicial — ' || v_acc.name, 'manual', gen_random_uuid(), v_uid);
    insert into journal_lines (id, organization_id, journal_entry_id, account_id, direction, amount)
    values (gen_random_uuid(), v_acc.organization_id, v_eid, p_account_id, 'debit', p_new_amount)
    returning id into v_entry;
    insert into audit_logs (organization_id, user_id, table_name, record_id, action, old_data, new_data)
    values (v_acc.organization_id, v_uid, 'journal_lines', v_entry.id, 'INSERT',
      jsonb_build_object('amount', 0, 'date', null),
      jsonb_build_object('amount', p_new_amount, 'date', coalesce(p_new_date, current_date), 'reason', p_reason, 'entry_id', v_eid));
  end if;

  update accounts set initial_balance = p_new_amount, updated_at = now() where id = p_account_id;

  return json_build_object('id', p_account_id, 'new_amount', p_new_amount);
end; $function$;

revoke all on function public.update_account_opening_balance(uuid, numeric, text, date) from public, anon;
grant execute on function public.update_account_opening_balance(uuid, numeric, text, date) to authenticated;
