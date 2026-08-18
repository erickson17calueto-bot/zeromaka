-- Abre escrita, com âmbito estreito, aos papéis novos — sem alterar nada do
-- que owner/admin/finance já podiam fazer (todas as condições são "OU",
-- nunca substituem user_writable_org_ids()).

-- Requisições: requisitante cria/edita/apaga as SUAS (a app já restringe
-- edição/remoção a status='pendente' — isto só abre a porta na base de
-- dados, a regra de negócio continua na app). Aprovador também escreve aqui
-- porque rejectRequisition() faz UPDATE direto à tabela, não por RPC.
drop policy if exists "Writers can insert requisitions" on public.requisitions;
create policy "Writers can insert requisitions" on public.requisitions for insert
with check (organization_id in (select user_writable_org_ids()) or user_can_write(organization_id, 'requisitions'));

drop policy if exists "Writers can update requisitions" on public.requisitions;
create policy "Writers can update requisitions" on public.requisitions for update
using (organization_id in (select user_writable_org_ids()) or user_can_write(organization_id, 'requisitions'));

drop policy if exists "Writers can delete requisitions" on public.requisitions;
create policy "Writers can delete requisitions" on public.requisitions for delete
using (organization_id in (select user_writable_org_ids()) or user_can_write(organization_id, 'requisitions'));

-- approve_requisition: só o caminho SEM desembolso (p_disburse=false) abre
-- para o aprovador — decidir não mexe no razão. O caminho COM desembolso
-- continua reservado a quem já podia (o desembolso move dinheiro; o
-- aprovador, por desenho, nunca o faz).
create or replace function public.approve_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid, p_disburse boolean DEFAULT true)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  if p_disburse then
    if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão'; end if;
  else
    if p_org_id not in (select user_writable_org_ids()) and not user_can_write(p_org_id, 'requisitions') then
      raise exception 'Sem permissão';
    end if;
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Requisição não está pendente'; end if;

  if not p_disburse then
    update requisitions set status = 'aguardando_desembolso', decided_at = now() where id = p_req_id;
    return json_build_object('requisition_id', p_req_id, 'status', 'aguardando_desembolso', 'entry_id', null);
  end if;

  v_eid := _disburse_requisition_ledger(v_req, p_account_id, p_org_id, v_uid);

  update requisitions set
    status = case when v_req.type in ('employee_loan', 'salary_advance') then 'desembolsada'::req_status else 'aprovado'::req_status end,
    account_id = p_account_id, decided_at = now()
  where id = p_req_id;

  return json_build_object('requisition_id', p_req_id, 'status', case when v_req.type in ('employee_loan', 'salary_advance') then 'desembolsada' else 'aprovado' end, 'entry_id', v_eid);
end; $function$;

-- disburse_requisition é só desembolso (move dinheiro) — abre para quem tem
-- escrita no razão (caixa), além de quem já podia.
create or replace function public.disburse_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_write(p_org_id, 'ledger') then
    raise exception 'Sem permissão';
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'aguardando_desembolso' then raise exception 'Requisição não está a aguardar desembolso'; end if;

  v_eid := _disburse_requisition_ledger(v_req, p_account_id, p_org_id, v_uid);

  update requisitions set status = 'desembolsada', account_id = p_account_id, decided_at = now() where id = p_req_id;

  return json_build_object('requisition_id', p_req_id, 'status', 'desembolsada', 'entry_id', v_eid);
end; $function$;

-- grant_employee_loan: abre para o RH, que gere empréstimos/adiantamentos.
create or replace function public.grant_employee_loan(p_org_id uuid, p_contact_id uuid, p_account_id uuid, p_amount numeric, p_kind obligation_document_kind, p_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_document_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_contact record;
  v_entry_id uuid := gen_random_uuid();
  v_entry_num text;
  v_ob_id uuid := gen_random_uuid();
  v_ob_num text;
  v_desc text;
  v_entry_type journal_entry_type := case when p_kind = 'salary_advance' then 'salary_advance_disbursement' else 'loan_disbursement' end;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_write(p_org_id, 'loans') then
    raise exception 'Sem permissão nesta organização';
  end if;
  if p_kind not in ('employee_loan', 'salary_advance') then raise exception 'Tipo inválido — use employee_loan ou salary_advance'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = p_org_id and category_type = 'expense' and is_active) then raise exception 'Categoria inválida ou não é do tipo despesa'; end if;

  select * into v_contact from contacts where id = p_contact_id and organization_id = p_org_id;
  if v_contact.id is null then raise exception 'Contacto não pertence a esta organização'; end if;
  if v_contact.kind not in ('funcionario', 'ambos') then
    raise exception 'Só é possível conceder empréstimos ou adiantamentos a contactos do tipo funcionário';
  end if;

  v_desc := coalesce(nullif(btrim(p_description), ''),
    (case when p_kind = 'salary_advance' then 'Adiantamento salarial — ' else 'Empréstimo a funcionário — ' end) || v_contact.name);

  v_entry_num := next_entry_number(p_org_id, extract(year from p_date)::int);
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, contact_id, category_id, source, idempotency_key, created_by, metadata)
  values (v_entry_id, p_org_id, v_entry_num, v_entry_type, p_date, v_desc, p_contact_id, p_category_id, 'manual', gen_random_uuid(), v_uid, jsonb_build_object('kind', p_kind, 'employee_loan_obligation_id', v_ob_id));
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount)
  values (p_org_id, v_entry_id, p_account_id, 'credit', p_amount);

  v_ob_num := next_document_number(p_org_id, 'EMP', extract(year from p_date)::int);
  insert into financial_obligations (
    id, organization_id, direction, internal_number, contact_id, document_kind,
    external_document_number, issue_date, due_date, original_amount, currency_code,
    description, notes, category_id, source, created_by, is_sale, disbursement_entry_id
  ) values (
    v_ob_id, p_org_id, 'receivable', v_ob_num, p_contact_id, p_kind,
    nullif(btrim(coalesce(p_document_number, '')), ''), p_date, coalesce(p_due_date, p_date), p_amount, 'AOA',
    v_desc, p_notes, p_category_id, 'manual', v_uid, false, v_entry_id
  );

  return json_build_object('id', v_ob_id, 'internal_number', v_ob_num, 'entry_id', v_entry_id);
end; $function$;

-- post_settlement: a verificação passa a ser POR OBRIGAÇÃO (dentro do loop
-- que já existia), não só pela direção do pagamento — sem isto, um cobrador
-- (só devia poder receber de clientes) conseguiria registar uma devolução
-- de empréstimo só porque ambos usam direction='incoming'. Cada alocação
-- verifica o document_kind real da obrigação que está a pagar.
create or replace function public.post_settlement(p_org_id uuid, p_direction settlement_direction, p_contact_id uuid, p_account_id uuid, p_allocations jsonb, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_reserve_id uuid DEFAULT NULL::uuid, p_document_kind entry_document_kind DEFAULT NULL::entry_document_kind, p_document_number text DEFAULT NULL::text)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_sid uuid := gen_random_uuid();
  v_num text; v_ex record;
  v_total numeric(20,2) := 0;
  v_alloc jsonb; v_ob_id uuid; v_amt numeric(20,2);
  v_ob record; v_paid numeric(20,2); v_outstanding numeric(20,2);
  v_req_dir obligation_direction := case when p_direction = 'incoming' then 'receivable' else 'payable' end;
  v_cat uuid; v_cat_type fin_category_type; v_use_cat uuid;
  v_res json; v_entry_id uuid; v_desc text; v_int text;
  v_reserve record; v_consume numeric(20,2); v_new_res numeric(20,2);
  v_rate numeric := coalesce(org_tax_rate(p_org_id), 0);
  v_is_sale boolean; v_meta jsonb;
  v_doc_number text := nullif(btrim(coalesce(p_document_number, '')), '');
  v_loan_entry_type journal_entry_type;
  v_entry_num text;
  v_doc_kind obligation_document_kind;
  v_has_generic_write boolean := p_org_id in (select user_writable_org_ids());
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;

  select id, internal_number into v_ex from settlements where organization_id = p_org_id and idempotency_key = v_idem;
  if v_ex.id is not null then return json_build_object('id', v_ex.id, 'internal_number', v_ex.internal_number, 'duplicate', true); end if;

  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  if not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then raise exception 'Nenhuma obrigação alocada'; end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_ob_id := (v_alloc->>'obligation_id')::uuid;
    v_amt := (v_alloc->>'amount')::numeric;
    if v_amt is null or v_amt <= 0 then raise exception 'Valor alocado deve ser positivo'; end if;
    select * into v_ob from financial_obligations where id = v_ob_id and organization_id = p_org_id for update;
    if v_ob.id is null then raise exception 'Obrigação não encontrada nesta organização'; end if;
    if v_ob.lifecycle_status <> 'open' then raise exception 'Obrigação % não está aberta', v_ob.internal_number; end if;
    if v_ob.direction <> v_req_dir then raise exception 'Direção do pagamento não corresponde à obrigação %', v_ob.internal_number; end if;
    if v_ob.contact_id <> p_contact_id then raise exception 'Obrigação % pertence a outro contacto', v_ob.internal_number; end if;

    if not v_has_generic_write then
      if v_ob.document_kind in ('employee_loan', 'salary_advance') then
        if not user_can_write(p_org_id, 'loans') then raise exception 'Sem permissão para pagamentos de empréstimos/adiantamentos'; end if;
      elsif p_direction = 'incoming' then
        if not user_can_write(p_org_id, 'obligations_receivable') then raise exception 'Sem permissão nesta organização'; end if;
      else
        if not user_can_write(p_org_id, 'obligations_payable') then raise exception 'Sem permissão nesta organização'; end if;
      end if;
    end if;

    select coalesce(sum(a.allocated_amount), 0) into v_paid
      from settlement_allocations a join settlements s on s.id = a.settlement_id and s.status = 'posted'
      where a.obligation_id = v_ob_id;
    v_outstanding := v_ob.original_amount - v_paid;
    if v_amt > v_outstanding then raise exception 'Pagamento excede saldo pendente da obrigação % (pendente %, tentado %)', v_ob.internal_number, v_outstanding, v_amt; end if;
    v_total := v_total + v_amt;
  end loop;

  if p_reserve_id is not null then
    select * into v_reserve from financial_reserves where id = p_reserve_id for update;
    if v_reserve.id is null then raise exception 'Reserva não encontrada'; end if;
    if v_reserve.organization_id <> p_org_id then raise exception 'Reserva não pertence a esta organização'; end if;
    if v_reserve.status not in ('active','partially_released') then raise exception 'Reserva não está ativa'; end if;
    if p_direction <> 'outgoing' then raise exception 'Só pagamentos a fornecedor podem consumir reservas'; end if;
    if v_reserve.obligation_id is not null and not exists (
      select 1 from jsonb_array_elements(p_allocations) e where (e->>'obligation_id')::uuid = v_reserve.obligation_id
    ) then raise exception 'A reserva está ligada a outra obrigação'; end if;
  end if;

  v_num := next_document_number(p_org_id, 'LIQ', extract(year from p_payment_date)::int);
  insert into settlements (id, organization_id, internal_number, direction, contact_id, account_id, payment_date, total_amount, payment_method, reference, notes, status, idempotency_key, created_by, document_kind, document_number)
  values (v_sid, p_org_id, v_num, p_direction, p_contact_id, p_account_id, p_payment_date, v_total, p_payment_method, p_reference, p_notes, 'posted', v_idem, v_uid, p_document_kind, v_doc_number);

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    v_ob_id := (v_alloc->>'obligation_id')::uuid;
    v_amt := (v_alloc->>'amount')::numeric;
    select category_id, internal_number, is_sale, document_kind into v_cat, v_int, v_is_sale, v_doc_kind from financial_obligations where id = v_ob_id;
    v_desc := case when p_direction = 'incoming' then 'Recebimento ' else 'Pagamento ' end || v_int || ' (' || v_num || ')';
    v_meta := jsonb_build_object('settlement_id', v_sid, 'obligation_id', v_ob_id, 'kind', 'settlement');

    if v_doc_kind in ('employee_loan', 'salary_advance') then
      v_loan_entry_type := case when v_doc_kind = 'salary_advance' then 'salary_advance_repayment' else 'loan_repayment' end;
      v_entry_id := gen_random_uuid();
      v_entry_num := next_entry_number(p_org_id, extract(year from p_payment_date)::int);
      insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, reference, contact_id, source, idempotency_key, created_by, metadata, document_kind, document_number)
      values (v_entry_id, p_org_id, v_entry_num, v_loan_entry_type, p_payment_date, v_desc, p_reference, p_contact_id, 'manual', gen_random_uuid(), v_uid, v_meta, p_document_kind, v_doc_number);
      insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values (p_org_id, v_entry_id, p_account_id, 'debit', v_amt);
    else
      v_use_cat := null;
      if v_cat is not null then
        select category_type into v_cat_type from financial_categories where id = v_cat;
        if p_direction = 'incoming' and v_cat_type = 'income' then v_use_cat := v_cat; end if;
        if p_direction = 'outgoing' and v_cat_type = 'expense' then v_use_cat := v_cat; end if;
      end if;
      if p_direction = 'incoming' and v_is_sale and v_rate > 0 then
        v_meta := v_meta || jsonb_build_object('is_sale', true, 'tax_amount', coalesce(org_sale_tax(p_org_id, v_amt), 0));
      end if;
      if p_direction = 'incoming' then
        v_res := post_income(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), v_meta, p_document_kind, v_doc_number, p_payment_date, null);
      else
        v_res := post_expense(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), v_meta, p_document_kind, v_doc_number, p_payment_date, null);
      end if;
      v_entry_id := (v_res->>'id')::uuid;
    end if;

    insert into settlement_allocations (organization_id, settlement_id, obligation_id, allocated_amount, journal_entry_id)
    values (p_org_id, v_sid, v_ob_id, v_amt, v_entry_id);
  end loop;

  if p_reserve_id is not null then
    v_consume := least(v_reserve.reserved_amount, v_total);
    v_new_res := v_reserve.reserved_amount - v_consume;
    update financial_reserves set
      reserved_amount = v_new_res,
      status = case when v_new_res = 0 then 'released'::reserve_status else 'partially_released'::reserve_status end,
      released_at = case when v_new_res = 0 then now() else released_at end,
      released_by = case when v_new_res = 0 then v_uid else released_by end,
      release_reason = case when v_new_res = 0 then 'Consumida no pagamento ' || v_num else release_reason end
    where id = p_reserve_id;
    insert into reserve_movements (organization_id, reserve_id, movement_type, amount, reason, settlement_id, performed_by)
    values (p_org_id, p_reserve_id, 'consume_on_payment', v_consume, 'Utilizada no pagamento ' || v_num, v_sid, v_uid);
  end if;

  return json_build_object('id', v_sid, 'internal_number', v_num, 'total', v_total, 'duplicate', false,
    'reserve_consumed', case when p_reserve_id is not null then v_consume else null end);
end; $function$;

-- NOTA: a versão de post_settlement/post_income/post_expense acima ainda
-- chama post_income/post_expense por dentro. Isso foi corrigido na migração
-- seguinte (20260817_0066) depois de um teste ao vivo mostrar que abria uma
-- via de fabricação de lançamento arbitrário — ver esse ficheiro para a
-- versão final e o porquê.
