-- ACHADO GRAVE ao testar (20260817_0065 alargou demais): abrir
-- post_income/post_expense a quem tem 'obligations_receivable'/
-- 'obligations_payable'/'loans' deixava um cobrador chamar post_expense
-- DIRETAMENTE e fabricar uma despesa arbitrária sem nenhuma obrigação real
-- por trás — post_settlement valida por obrigação, mas post_income/
-- post_expense não sabem disso, só sabem "este utilizador tem alguma
-- permissão de escrita relacionada". Provado ao vivo antes desta correção:
--
--   cobrador chama post_expense(...) diretamente -> SUCESSO (devia falhar)
--
-- Correção: post_income/post_expense voltam a exigir escrita GERAL no razão
-- (user_writable_org_ids() ou 'ledger') — cobrador/pagador/rh deixam de os
-- poder chamar diretamente. post_settlement passa a escrever o lançamento
-- através de uma função PRIVADA (_post_settlement_ledger_entry, sem GRANT a
-- authenticated/anon — só é alcançável de dentro de outra função SECURITY
-- DEFINER) que faz o mesmo insert mas sem repetir a verificação, porque
-- post_settlement já validou precisamente por obrigação antes de chegar
-- aqui. next_entry_number/next_document_number continuam permissivos
-- (user_can_write_ledger, de 20260817_0065) porque só numeram, não
-- escrevem — o insert em si é que fica fechado ao caminho validado.

create or replace function public.post_income(p_org_id uuid, p_account_id uuid, p_amount numeric, p_description text, p_date date DEFAULT CURRENT_DATE, p_category_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_document_kind entry_document_kind DEFAULT NULL::entry_document_kind, p_document_number text DEFAULT NULL::text, p_document_date date DEFAULT NULL::date, p_document_notes text DEFAULT NULL::text)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_eid uuid := gen_random_uuid(); v_num text;
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid()); v_ex record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_write(p_org_id, 'ledger') then
    raise exception 'Sem permissão para lançar nesta organização';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = p_org_id and category_type = 'income' and is_active) then raise exception 'Categoria inválida ou não é do tipo receita'; end if;
  if p_contact_id is not null and not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  select id, entry_number into v_ex from journal_entries where organization_id = p_org_id and idempotency_key = v_idem;
  if v_ex.id is not null then return json_build_object('id', v_ex.id, 'entry_number', v_ex.entry_number, 'duplicate', true); end if;
  v_num := next_entry_number(p_org_id, extract(year from p_date)::int);
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, reference, contact_id, category_id, source, idempotency_key, created_by, metadata, document_kind, document_number, document_date, document_notes)
  values (v_eid, p_org_id, v_num, 'income', p_date, p_description, p_reference, p_contact_id, p_category_id, 'manual', v_idem, v_uid, p_metadata, p_document_kind, nullif(btrim(coalesce(p_document_number, '')), ''), p_document_date, nullif(btrim(coalesce(p_document_notes, '')), ''));
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values (p_org_id, v_eid, p_account_id, 'debit', p_amount);
  return json_build_object('id', v_eid, 'entry_number', v_num);
end; $function$;

create or replace function public.post_expense(p_org_id uuid, p_account_id uuid, p_amount numeric, p_description text, p_date date DEFAULT CURRENT_DATE, p_category_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_document_kind entry_document_kind DEFAULT NULL::entry_document_kind, p_document_number text DEFAULT NULL::text, p_document_date date DEFAULT NULL::date, p_document_notes text DEFAULT NULL::text)
 returns json
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_eid uuid := gen_random_uuid(); v_num text;
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid()); v_ex record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) and not user_can_write(p_org_id, 'ledger') then
    raise exception 'Sem permissão para lançar nesta organização';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then raise exception 'Conta inválida ou arquivada'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = p_org_id and category_type = 'expense' and is_active) then raise exception 'Categoria inválida ou não é do tipo despesa'; end if;
  if p_contact_id is not null and not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  select id, entry_number into v_ex from journal_entries where organization_id = p_org_id and idempotency_key = v_idem;
  if v_ex.id is not null then return json_build_object('id', v_ex.id, 'entry_number', v_ex.entry_number, 'duplicate', true); end if;
  v_num := next_entry_number(p_org_id, extract(year from p_date)::int);
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, reference, contact_id, category_id, source, idempotency_key, created_by, metadata, document_kind, document_number, document_date, document_notes)
  values (v_eid, p_org_id, v_num, 'expense', p_date, p_description, p_reference, p_contact_id, p_category_id, 'manual', v_idem, v_uid, p_metadata, p_document_kind, nullif(btrim(coalesce(p_document_number, '')), ''), p_document_date, nullif(btrim(coalesce(p_document_notes, '')), ''));
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount) values (p_org_id, v_eid, p_account_id, 'credit', p_amount);
  return json_build_object('id', v_eid, 'entry_number', v_num);
end; $function$;

-- Função privada: mesmo insert de post_income/post_expense, sem a
-- verificação de permissão geral (o chamador — só post_settlement — já
-- validou precisamente por obrigação antes de chegar aqui). Sem GRANT a
-- authenticated/anon: só alcançável de dentro de outra função SECURITY
-- DEFINER do mesmo schema. entry_type/direction precisam de cast explícito
-- para o enum — um CASE devolvendo texto não converte sozinho aqui (apanhado
-- no primeiro teste ao vivo desta função).
create or replace function public._post_settlement_ledger_entry(
  p_org_id uuid, p_account_id uuid, p_amount numeric, p_is_income boolean,
  p_description text, p_date date, p_category_id uuid, p_contact_id uuid,
  p_reference text, p_metadata jsonb, p_document_kind entry_document_kind, p_document_number text
) returns uuid
 language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_eid uuid := gen_random_uuid(); v_num text;
begin
  v_num := next_entry_number(p_org_id, extract(year from p_date)::int);
  insert into journal_entries (id, organization_id, entry_number, entry_type, transaction_date, description, reference, contact_id, category_id, source, idempotency_key, created_by, metadata, document_kind, document_number)
  values (v_eid, p_org_id, v_num, (case when p_is_income then 'income' else 'expense' end)::journal_entry_type, p_date, p_description, p_reference, p_contact_id, p_category_id, 'manual', gen_random_uuid(), v_uid, p_metadata, p_document_kind, nullif(btrim(coalesce(p_document_number, '')), ''));
  insert into journal_lines (organization_id, journal_entry_id, account_id, direction, amount)
  values (p_org_id, v_eid, p_account_id, (case when p_is_income then 'debit' else 'credit' end)::line_direction, p_amount);
  return v_eid;
end; $function$;
revoke all on function public._post_settlement_ledger_entry(uuid, uuid, numeric, boolean, text, date, uuid, uuid, text, jsonb, entry_document_kind, text) from public, anon, authenticated;

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
  v_entry_id uuid; v_desc text; v_int text;
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
      -- Escreve pela função privada, não por post_income/post_expense: estas
      -- exigem escrita GERAL no razão, que cobrador/pagador/rh não têm por
      -- desenho — só a permissão estreita já validada acima, por obrigação.
      v_entry_id := _post_settlement_ledger_entry(
        p_org_id, p_account_id, v_amt, p_direction = 'incoming',
        v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, v_meta, p_document_kind, v_doc_number
      );
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

-- VERIFICADO ao vivo antes de escrever este ficheiro (org de teste, Test Org
-- F, papel do membro de teste reposto entre cada bloco):
--   requisitante cria requisição (INSERT direto na tabela); não cria conta.
--   aprovador aprova sem desembolsar (status -> aguardando_desembolso); não
--     consegue desembolsar (erro de permissão).
--   rh concede empréstimo com sucesso.
--   cobrador regista um recebimento real via post_settlement — saldo da
--     conta sobe exatamente o valor pago, confirmado por
--     current_account_balance() antes/depois; NÃO consegue registar uma
--     devolução de empréstimo (document_kind errado, mesmo com
--     direction='incoming' igual); NÃO consegue chamar post_income/
--     post_expense diretamente (a falha grave desta migração, fechada).
--   owner e caixa continuam a poder chamar post_expense diretamente
--     (regressão, sem alteração de comportamento).
