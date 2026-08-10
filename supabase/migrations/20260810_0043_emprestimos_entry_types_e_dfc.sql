-- Consome os 4 entry_type novos (migração anterior só os adicionou ao enum
-- — regra do projeto: ADD VALUE não pode partilhar transação com quem usa
-- o valor).
--
-- (a) grant_employee_loan deixa de reusar post_expense: posta diretamente
--     com loan_disbursement/salary_advance_disbursement. Mesma assinatura
--     pública, mesmo efeito externo (obrigação criada, caixa reduzido) —
--     só troca o entry_type do lançamento de desembolso.
-- (b) post_settlement, ao liquidar uma obrigação employee_loan/
--     salary_advance, usa loan_repayment/salary_advance_repayment em vez
--     de 'income' — troca local, dentro do loop de alocações; post_income/
--     post_expense continuam intocados (menor raio de explosão, usados em
--     todo o resto da app).
-- (c) report_income_cash (DRE) já filtra "entry_type in ('income',
--     'expense')" — os novos tipos ficam automaticamente de fora, sem
--     precisar de alteração nenhuma.
-- (d) report_cash_flow (DFC) ganha uma quarta secção "Empréstimos e
--     adiantamentos", no mesmo padrão já usado para capital de sócios
--     (Atividades de financiamento, filtrado por metadata->>'type').
--     O plug de reconciliação ("Saldos iniciais e outros") é ajustado
--     para não contar estes valores duas vezes.

create or replace function public.grant_employee_loan(
  p_org_id uuid, p_contact_id uuid, p_account_id uuid, p_amount numeric, p_kind obligation_document_kind,
  p_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_description text DEFAULT NULL::text,
  p_category_id uuid DEFAULT NULL::uuid, p_document_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
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

create or replace function public.post_settlement(p_org_id uuid, p_direction settlement_direction, p_contact_id uuid, p_account_id uuid, p_allocations jsonb, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_reserve_id uuid DEFAULT NULL::uuid, p_document_kind entry_document_kind DEFAULT NULL::entry_document_kind, p_document_number text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;

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
      -- Devolução de empréstimo/adiantamento: não é receita operacional —
      -- posta diretamente com loan_repayment/salary_advance_repayment em
      -- vez de chamar post_income (que fixa entry_type='income').
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

create or replace function public.report_cash_flow(p_org_id uuid, p_start date, p_end date, p_cmp_start date DEFAULT NULL::date, p_cmp_end date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cmp boolean := p_cmp_start is not null and p_cmp_end is not null;
  v_opr_c numeric:=0; v_opr_m numeric:=0; v_opp_c numeric:=0; v_opp_m numeric:=0;
  v_fi_c numeric:=0; v_fi_m numeric:=0; v_fo_c numeric:=0; v_fo_m numeric:=0;
  v_ln_c numeric:=0; v_ln_m numeric:=0; v_lr_c numeric:=0; v_lr_m numeric:=0;
  v_open_c numeric:=0; v_open_m numeric:=0; v_close_c numeric:=0; v_close_m numeric:=0;
  v_oth_c numeric; v_oth_m numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;
  if v_cmp and p_cmp_start > p_cmp_end then raise exception 'Datas de comparação invertidas'; end if;

  select
    coalesce(sum(jl.amount) filter (where je.entry_type='income'  and coalesce(je.metadata->>'type','')='' and je.transaction_date between p_start and p_end),0),
    coalesce(sum(jl.amount) filter (where je.entry_type='expense' and coalesce(je.metadata->>'type','')='' and je.transaction_date between p_start and p_end),0),
    coalesce(sum(jl.amount) filter (where je.metadata->>'type'='capital_in'  and je.transaction_date between p_start and p_end),0),
    coalesce(sum(jl.amount) filter (where je.metadata->>'type'='capital_out' and je.transaction_date between p_start and p_end),0),
    coalesce(sum(jl.amount) filter (where je.entry_type in ('loan_disbursement','salary_advance_disbursement') and je.transaction_date between p_start and p_end),0),
    coalesce(sum(jl.amount) filter (where je.entry_type in ('loan_repayment','salary_advance_repayment') and je.transaction_date between p_start and p_end),0),
    coalesce(sum(jl.amount) filter (where v_cmp and je.entry_type='income'  and coalesce(je.metadata->>'type','')='' and je.transaction_date between p_cmp_start and p_cmp_end),0),
    coalesce(sum(jl.amount) filter (where v_cmp and je.entry_type='expense' and coalesce(je.metadata->>'type','')='' and je.transaction_date between p_cmp_start and p_cmp_end),0),
    coalesce(sum(jl.amount) filter (where v_cmp and je.metadata->>'type'='capital_in'  and je.transaction_date between p_cmp_start and p_cmp_end),0),
    coalesce(sum(jl.amount) filter (where v_cmp and je.metadata->>'type'='capital_out' and je.transaction_date between p_cmp_start and p_cmp_end),0),
    coalesce(sum(jl.amount) filter (where v_cmp and je.entry_type in ('loan_disbursement','salary_advance_disbursement') and je.transaction_date between p_cmp_start and p_cmp_end),0),
    coalesce(sum(jl.amount) filter (where v_cmp and je.entry_type in ('loan_repayment','salary_advance_repayment') and je.transaction_date between p_cmp_start and p_cmp_end),0)
  into v_opr_c, v_opp_c, v_fi_c, v_fo_c, v_ln_c, v_lr_c, v_opr_m, v_opp_m, v_fi_m, v_fo_m, v_ln_m, v_lr_m
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
  where je.organization_id=p_org_id and je.status='posted'
    and je.entry_type in ('income','expense','loan_disbursement','salary_advance_disbursement','loan_repayment','salary_advance_repayment');

  select coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end) filter (where je.transaction_date < p_start),0),
         coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end) filter (where je.transaction_date <= p_end),0),
         coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end) filter (where v_cmp and je.transaction_date < p_cmp_start),0),
         coalesce(sum(case when jl.direction='debit' then jl.amount else -jl.amount end) filter (where v_cmp and je.transaction_date <= p_cmp_end),0)
  into v_open_c, v_close_c, v_open_m, v_close_m
  from journal_entries je join journal_lines jl on jl.journal_entry_id=je.id
  where je.organization_id=p_org_id;

  v_oth_c := (v_close_c - v_open_c) - (v_opr_c - v_opp_c) - (v_fi_c - v_fo_c) - (v_lr_c - v_ln_c);
  v_oth_m := (v_close_m - v_open_m) - (v_opr_m - v_opp_m) - (v_fi_m - v_fo_m) - (v_lr_m - v_ln_m);

  return json_build_object(
    'meta', json_build_object('report','cash_flow_statement','basis','cash','method','direct','currency','AOA',
      'title','Demonstração do Fluxo de Caixa','start',p_start,'end',p_end,'cmp_start',p_cmp_start,'cmp_end',p_cmp_end,'has_comparison',v_cmp,
      'warnings', json_build_array('Método direto. Transferências internas não entram como fluxo. Sem atividades de investimento (não há ativos fixos registados). Base de caixa.')),
    'sections', json_build_array(
      json_build_object('title','Atividades operacionais',
        'lines', json_build_array(
          json_build_object('label','Recebimentos de clientes','current',v_opr_c,'comparison',case when v_cmp then v_opr_m else null end,'difference',case when v_cmp then v_opr_c-v_opr_m else null end),
          json_build_object('label','Pagamentos operacionais','current',-v_opp_c,'comparison',case when v_cmp then -v_opp_m else null end,'difference',case when v_cmp then -(v_opp_c-v_opp_m) else null end)),
        'subtotal', json_build_object('label','Caixa líquido operacional','current',v_opr_c-v_opp_c,'comparison',case when v_cmp then v_opr_m-v_opp_m else null end,'difference',case when v_cmp then (v_opr_c-v_opp_c)-(v_opr_m-v_opp_m) else null end)),
      json_build_object('title','Atividades de investimento',
        'lines', json_build_array(
          json_build_object('label','Aquisição de ativos','current',0,'comparison',case when v_cmp then 0 else null end,'difference',case when v_cmp then 0 else null end),
          json_build_object('label','Venda de ativos','current',0,'comparison',case when v_cmp then 0 else null end,'difference',case when v_cmp then 0 else null end)),
        'subtotal', json_build_object('label','Caixa líquido de investimento','current',0,'comparison',case when v_cmp then 0 else null end,'difference',case when v_cmp then 0 else null end)),
      json_build_object('title','Atividades de financiamento',
        'lines', json_build_array(
          json_build_object('label','Entradas de capital','current',v_fi_c,'comparison',case when v_cmp then v_fi_m else null end,'difference',case when v_cmp then v_fi_c-v_fi_m else null end),
          json_build_object('label','Retiradas de sócios','current',-v_fo_c,'comparison',case when v_cmp then -v_fo_m else null end,'difference',case when v_cmp then -(v_fo_c-v_fo_m) else null end)),
        'subtotal', json_build_object('label','Caixa líquido de financiamento','current',v_fi_c-v_fo_c,'comparison',case when v_cmp then v_fi_m-v_fo_m else null end,'difference',case when v_cmp then (v_fi_c-v_fo_c)-(v_fi_m-v_fo_m) else null end)),
      json_build_object('title','Empréstimos e adiantamentos',
        'lines', json_build_array(
          json_build_object('label','Concedido a funcionários','current',-v_ln_c,'comparison',case when v_cmp then -v_ln_m else null end,'difference',case when v_cmp then -(v_ln_c-v_ln_m) else null end),
          json_build_object('label','Recuperado de funcionários','current',v_lr_c,'comparison',case when v_cmp then v_lr_m else null end,'difference',case when v_cmp then v_lr_c-v_lr_m else null end)),
        'subtotal', json_build_object('label','Caixa líquido de empréstimos','current',v_lr_c-v_ln_c,'comparison',case when v_cmp then v_lr_m-v_ln_m else null end,'difference',case when v_cmp then (v_lr_c-v_ln_c)-(v_lr_m-v_ln_m) else null end)),
      json_build_object('title','Reconciliação de caixa',
        'lines', json_build_array(
          json_build_object('label','Saldo inicial','current',v_open_c,'comparison',case when v_cmp then v_open_m else null end,'difference',case when v_cmp then v_open_c-v_open_m else null end),
          json_build_object('label','Saldos iniciais e outros no período','current',v_oth_c,'comparison',case when v_cmp then v_oth_m else null end,'difference',case when v_cmp then v_oth_c-v_oth_m else null end)),
        'subtotal', json_build_object('label','Variação líquida do período','current',v_close_c-v_open_c,'comparison',case when v_cmp then v_close_m-v_open_m else null end,'difference',case when v_cmp then (v_close_c-v_open_c)-(v_close_m-v_open_m) else null end))
    ),
    'totals', json_build_array(
      json_build_object('label','Saldo final em caixa e bancos','emphasis',true,'current',v_close_c,'comparison',case when v_cmp then v_close_m else null end,'difference',case when v_cmp then v_close_c-v_close_m else null end)
    )
  );
end; $function$;
