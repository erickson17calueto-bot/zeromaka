-- Empréstimos e adiantamentos salariais a funcionários — parte 2.
--
-- Diferença chave em relação a uma fatura normal: numa fatura de cliente, o
-- caixa só se mexe quando o cliente paga (create_financial_obligation nunca
-- toca em journal_entries). Aqui é ao contrário — a empresa entrega o
-- dinheiro PRIMEIRO. grant_employee_loan por isso faz duas coisas na mesma
-- transação: tira o dinheiro da conta agora (post_expense) e regista uma
-- obrigação a receber para acompanhar a devolução — a devolução em si
-- reaproveita post_settlement sem alterações, exatamente como qualquer conta
-- a receber normal.
--
-- Simplificação assumida e documentada (mesmo padrão já usado em
-- approve_requisition para adiantamentos de despesa): por não existir uma
-- conta-tipo "a receber de funcionários" no livro de contas (só bancos/
-- caixa/carteiras móveis), o desembolso entra como despesa e a devolução como
-- receita — sobem/descem ligeiramente os totais de despesas/receitas nos
-- relatórios até ao momento em que a devolução acontece, mesmo não sendo
-- puramente nem uma coisa nem outra. A categoria dedicada existe precisamente
-- para se poder filtrar/excluir isto nos relatórios quando necessário.

alter table public.financial_obligations
  add column if not exists disbursement_entry_id uuid references public.journal_entries(id);

-- Só grant_employee_loan pode criar uma obrigação employee_loan/salary_advance
-- — garante que nunca existe uma sem o desembolso emparelhado.
create or replace function public.create_financial_obligation(p_org_id uuid, p_direction obligation_direction, p_contact_id uuid, p_due_date date, p_amount numeric, p_document_kind obligation_document_kind DEFAULT 'other'::obligation_document_kind, p_external_document_number text DEFAULT NULL::text, p_issue_date date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'AOA'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_is_sale boolean DEFAULT NULL::boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_id uuid := gen_random_uuid(); v_num text; v_prefix text;
  v_is_sale boolean; v_rate numeric; v_tax numeric(20,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;
  if p_due_date < p_issue_date then raise exception 'Vencimento não pode ser anterior à emissão'; end if;
  if not exists (select 1 from contacts where id = p_contact_id and organization_id = p_org_id) then raise exception 'Contacto não pertence a esta organização'; end if;
  if p_category_id is not null and not exists (select 1 from financial_categories where id = p_category_id and organization_id = p_org_id and is_active) then raise exception 'Categoria inválida'; end if;
  if p_document_kind in ('employee_loan', 'salary_advance') then
    raise exception 'Empréstimos e adiantamentos a funcionários criam-se com grant_employee_loan, para o desembolso ser sempre registado junto';
  end if;

  v_is_sale := coalesce(p_is_sale, p_direction = 'receivable');
  v_rate := coalesce(org_tax_rate(p_org_id), 0);
  v_tax := case when v_is_sale then coalesce(org_sale_tax(p_org_id, p_amount), 0) else 0 end;

  v_prefix := case when p_direction = 'receivable' then 'REC' else 'PAG' end;
  v_num := next_document_number(p_org_id, v_prefix, extract(year from p_issue_date)::int);
  insert into financial_obligations (id, organization_id, direction, internal_number, contact_id, document_kind, external_document_number, issue_date, due_date, original_amount, currency_code, description, notes, category_id, source, created_by, is_sale, tax_amount)
  values (v_id, p_org_id, p_direction, v_num, p_contact_id, p_document_kind, p_external_document_number, p_issue_date, p_due_date, p_amount, coalesce(p_currency, 'AOA'), p_description, p_notes, p_category_id, 'manual', v_uid, v_is_sale, v_tax);
  return json_build_object('id', v_id, 'internal_number', v_num, 'is_sale', v_is_sale, 'tax_amount', v_tax);
end; $function$;

create or replace function public.grant_employee_loan(
  p_org_id uuid, p_contact_id uuid, p_account_id uuid, p_amount numeric,
  p_kind obligation_document_kind,
  p_date date default current_date, p_due_date date default null,
  p_description text default null, p_category_id uuid default null,
  p_document_number text default null, p_notes text default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_contact record;
  v_entry_res json;
  v_entry_id uuid;
  v_ob_id uuid := gen_random_uuid();
  v_ob_num text;
  v_desc text;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_kind not in ('employee_loan', 'salary_advance') then raise exception 'Tipo inválido — use employee_loan ou salary_advance'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;

  select * into v_contact from contacts where id = p_contact_id and organization_id = p_org_id;
  if v_contact.id is null then raise exception 'Contacto não pertence a esta organização'; end if;
  if v_contact.kind not in ('funcionario', 'ambos') then
    raise exception 'Só é possível conceder empréstimos ou adiantamentos a contactos do tipo funcionário';
  end if;

  v_desc := coalesce(nullif(btrim(p_description), ''),
    (case when p_kind = 'salary_advance' then 'Adiantamento salarial — ' else 'Empréstimo a funcionário — ' end) || v_contact.name);

  -- 1) O dinheiro sai da conta agora — ao contrário de uma fatura normal, aqui
  -- não há "entrega depois paga": a empresa entrega o dinheiro já.
  v_entry_res := public.post_expense(
    p_org_id := p_org_id, p_account_id := p_account_id, p_amount := p_amount,
    p_description := v_desc, p_date := p_date, p_category_id := p_category_id,
    p_contact_id := p_contact_id,
    p_metadata := jsonb_build_object('kind', p_kind, 'employee_loan_obligation_id', v_ob_id)
  );
  v_entry_id := (v_entry_res->>'id')::uuid;

  -- 2) Regista o valor a recuperar — mesma mecânica de uma conta a receber
  -- (outstandingAmount desce com cada devolução via post_settlement), mas o
  -- caixa já se mexeu no passo 1, não se mexe outra vez aqui.
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
end; $$;

revoke all on function public.grant_employee_loan(uuid, uuid, uuid, numeric, obligation_document_kind, date, date, text, uuid, text, text) from public, anon;
grant execute on function public.grant_employee_loan(uuid, uuid, uuid, numeric, obligation_document_kind, date, date, text, uuid, text, text) to authenticated;

-- Subcategorias dedicadas em "Pessoal" — idempotente como o resto do seed.
do $$
declare v_org record; v_pessoal uuid; v_uid uuid;
begin
  for v_org in select id from public.organizations loop
    select id into v_pessoal from financial_categories where organization_id = v_org.id and name = 'Pessoal' and category_type = 'expense' and parent_id is null;
    if v_pessoal is null then continue; end if; -- organização antiga sem "Pessoal" seedada — não força a criação da mãe aqui
    select created_by into v_uid from financial_categories where id = v_pessoal;
    insert into financial_categories (organization_id, name, category_type, is_system, created_by, parent_id)
    values
      (v_org.id, 'Empréstimos a funcionários', 'expense', true, v_uid, v_pessoal),
      (v_org.id, 'Adiantamentos salariais', 'expense', true, v_uid, v_pessoal)
    on conflict (organization_id, parent_id, category_type, name) do nothing;
  end loop;
end $$;
