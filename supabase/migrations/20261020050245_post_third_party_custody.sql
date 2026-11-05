-- A bank account may hold money belonging to someone else. These movements
-- change cash and a separate custody position, never operating income/expense.
create or replace function public.post_custody_movement(
  p_org_id uuid, p_account_id uuid, p_amount numeric, p_direction text,
  p_description text, p_date date, p_reference text,
  p_idempotency_key uuid default null
) returns json
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_entry_id uuid := gen_random_uuid();
  v_number text;
  v_existing record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select public.user_admin_org_ids()) then
    raise exception 'Apenas owner ou admin podem registar valores de terceiros';
  end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'Direção inválida';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Indica um valor positivo com até duas casas decimais';
  end if;
  if p_date is null or nullif(btrim(p_description), '') is null
      or nullif(btrim(p_reference), '') is null then
    raise exception 'Data, descrição e referência do extrato são obrigatórias';
  end if;
  if not exists (
    select 1 from public.accounts
    where id = p_account_id and organization_id = p_org_id and not is_archived
  ) then raise exception 'Conta inválida ou arquivada'; end if;

  select id, entry_number into v_existing
  from public.journal_entries
  where organization_id = p_org_id and idempotency_key = v_idem;
  if v_existing.id is not null then
    return json_build_object('id', v_existing.id,
      'entry_number', v_existing.entry_number, 'duplicate', true);
  end if;

  v_number := public.next_entry_number(p_org_id, extract(year from p_date)::int);
  insert into public.journal_entries (
    id, organization_id, entry_number, entry_type, transaction_date,
    description, reference, source, idempotency_key, created_by, metadata
  ) values (
    v_entry_id, p_org_id, v_number,
    (case when p_direction = 'in' then 'custody_in' else 'custody_out' end)::public.journal_entry_type,
    p_date, btrim(p_description), btrim(p_reference), 'manual', v_idem, v_uid,
    jsonb_build_object('type', 'third_party_custody', 'direction', p_direction)
  );
  insert into public.journal_lines (
    organization_id, journal_entry_id, account_id, direction, amount
  ) values (
    p_org_id, v_entry_id, p_account_id,
    (case when p_direction = 'in' then 'debit' else 'credit' end)::public.line_direction,
    p_amount
  );
  return json_build_object('id', v_entry_id, 'entry_number', v_number);
end;
$function$;

revoke all on function public.post_custody_movement(uuid, uuid, numeric, text, text, date, text, uuid)
  from public, anon;
grant execute on function public.post_custody_movement(uuid, uuid, numeric, text, text, date, text, uuid)
  to authenticated;
