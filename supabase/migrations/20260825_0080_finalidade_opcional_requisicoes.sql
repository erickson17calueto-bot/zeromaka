-- Requisições normais sempre aceitaram observação/finalidade vazia.
-- A migração 0074 tornou esse campo obrigatório por engano ao trocar o
-- INSERT direto pela RPC. Mantém-se a coluna NOT NULL (texto vazio é um
-- valor válido) e todas as verificações de autorização; só se remove a
-- validação indevida e normaliza NULL/espaços para ''.

create or replace function public.create_requisition(
  p_org_id uuid, p_requester text, p_approver text, p_department text,
  p_items jsonb, p_amount numeric, p_date date, p_purpose text, p_category text,
  p_type requisition_type default 'expense', p_beneficiary_contact_id uuid default null,
  p_due_date date default null, p_installments int default null, p_recovery_method text default null
) returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_number text;
  v_amount numeric;
  v_n int;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_do(p_org_id, 'requisitions', 'create_draft') then
    raise exception 'Sem permissão';
  end if;
  if p_requester is null or btrim(p_requester) = '' then raise exception 'Requisitante obrigatório'; end if;
  if p_approver is null or btrim(p_approver) = '' then raise exception 'Aprovador obrigatório'; end if;
  if p_category is null or btrim(p_category) = '' then raise exception 'Categoria obrigatória'; end if;

  v_amount := case
    when p_items is not null and jsonb_array_length(p_items) > 0
      then (select coalesce(sum((it->>'qty')::numeric * (it->>'unitPrice')::numeric), 0) from jsonb_array_elements(p_items) it)
    else p_amount
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;

  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':requisitions'));
  select count(*) + 1 into v_n from requisitions where organization_id = p_org_id;
  v_number := 'RQ-' || lpad(v_n::text, 3, '0') || '/' || lpad(extract(month from current_date)::text, 2, '0') || '/' || extract(year from current_date)::text;

  insert into requisitions (
    id, organization_id, number, requester, approver, department, items, amount, date, purpose, category,
    status, type, beneficiary_contact_id, due_date, installments, recovery_method, created_by
  ) values (
    v_id, p_org_id, v_number, p_requester, p_approver, nullif(btrim(coalesce(p_department, '')), ''),
    coalesce(p_items, '[]'::jsonb), v_amount, coalesce(p_date, current_date),
    coalesce(nullif(btrim(coalesce(p_purpose, '')), ''), ''), p_category,
    'pendente', p_type, p_beneficiary_contact_id, p_due_date, p_installments, p_recovery_method, v_uid
  );

  return json_build_object('id', v_id, 'number', v_number, 'amount', v_amount);
end; $function$;

revoke all on function public.create_requisition(uuid, text, text, text, jsonb, numeric, date, text, text, requisition_type, uuid, date, int, text) from public, anon;
grant execute on function public.create_requisition(uuid, text, text, text, jsonb, numeric, date, text, text, requisition_type, uuid, date, int, text) to authenticated;
