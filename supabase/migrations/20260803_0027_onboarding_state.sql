-- Fase 1 do onboarding: estado real na base de dados e conclusão atómica.
--
-- Antes, "onboarding concluído" era inferido de profiles.current_org_id não ser
-- nulo. Isso chega para um ecrã único, mas não para um fluxo de várias etapas:
-- não permite retomar a meio nem saber onde o utilizador ficou.

-- 1. Estado do onboarding no perfil ------------------------------------------

alter table public.profiles
  add column if not exists onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'completed')),
  add column if not exists onboarding_step smallint not null default 0
    check (onboarding_step between 0 and 6),
  add column if not exists onboarding_completed_at timestamptz,
  -- Rascunho das etapas já preenchidas, para não se perder tudo num refresh.
  add column if not exists onboarding_draft jsonb not null default '{}'::jsonb;

-- Quem já tem organização concluiu o onboarding na versão anterior.
update public.profiles
set onboarding_status = 'completed',
    onboarding_step = 6,
    onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, now())
where current_org_id is not null and onboarding_status <> 'completed';

-- 2. Campos da empresa pedidos nas etapas 1 e 2 ------------------------------

alter table public.companies
  add column if not exists legal_name text,
  add column if not exists activity text,
  add column if not exists timezone text not null default 'Africa/Luanda',
  add column if not exists currency text not null default 'AOA',
  add column if not exists fiscal_year_start_month smallint not null default 1
    check (fiscal_year_start_month between 1 and 12);

-- 3. Guardar progresso entre etapas ------------------------------------------

-- p_step é integer e não smallint: o PostgREST resolve um número JSON para
-- integer, e com smallint não encontrava a função (a coluna continua smallint).
create or replace function public.save_onboarding_progress(
  p_step integer,
  p_draft jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_step is null or p_step < 0 or p_step > 6 then
    raise exception 'Etapa inválida';
  end if;

  update public.profiles
  set onboarding_step = p_step::smallint,
      onboarding_draft = coalesce(p_draft, '{}'::jsonb),
      updated_at = now()
  where id = auth.uid()
    and onboarding_status = 'pending';  -- quem já concluiu não regride
end;
$$;

grant execute on function public.save_onboarding_progress(integer, jsonb) to authenticated;

-- 4. Conclusão atómica --------------------------------------------------------
--
-- Tudo o que o onboarding cria — organização, membro, empresa, definições,
-- conta, saldo inicial, contactos e obrigações — acontece numa só transação.
-- Se qualquer passo falhar, nada fica meio criado.

create or replace function public.complete_onboarding(p_payload jsonb)
returns json
language plpgsql
security definer
-- search_path fixo em public (e não vazio) porque as funções reutilizadas mais
-- abaixo — create_account_with_balance e create_financial_obligation — resolvem
-- helpers como user_writable_org_ids() sem qualificação de esquema. Sendo um
-- valor fixo e não controlado pelo utilizador, não abre vetor de injeção.
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_account_id uuid := gen_random_uuid();
  v_base_slug text;
  v_candidate text;
  v_n int := 0;
  v_opening numeric;
  v_contact jsonb;
  v_obl jsonb;
  v_contact_id uuid;
  v_contact_ids jsonb := '{}'::jsonb;
  v_company jsonb := coalesce(p_payload->'company', '{}'::jsonb);
  v_account jsonb := coalesce(p_payload->'account', '{}'::jsonb);
  v_org_name text := btrim(coalesce(p_payload->'organization'->>'name', v_company->>'name', ''));
  v_full_name text := btrim(coalesce(p_payload->'profile'->>'full_name', ''));
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  if v_org_name = '' then raise exception 'Indica o nome da organização'; end if;
  if btrim(coalesce(v_company->>'name', '')) = '' then raise exception 'Indica o nome comercial da empresa'; end if;
  if btrim(coalesce(v_account->>'name', '')) = '' then raise exception 'Indica o nome da primeira conta'; end if;

  -- Impede criar uma segunda organização por engano ao recarregar a página.
  if exists (select 1 from public.profiles where id = v_uid and onboarding_status = 'completed') then
    select current_org_id into v_org_id from public.profiles where id = v_uid;
    return json_build_object('organization_id', v_org_id, 'already_completed', true);
  end if;

  -- Slug único: normaliza e tenta sufixos até não colidir.
  v_base_slug := lower(v_org_name);
  v_base_slug := translate(v_base_slug, 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn');
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := btrim(v_base_slug, '-');
  if v_base_slug = '' then v_base_slug := 'org'; end if;

  v_candidate := v_base_slug;
  v_org_id := gen_random_uuid();
  loop
    begin
      insert into public.organizations (id, name, slug) values (v_org_id, v_org_name, v_candidate);
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
      if v_n > 100 then raise exception 'Não foi possível criar organização única'; end if;
      v_candidate := v_base_slug || '-' || v_n::text;
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_uid, 'owner');

  insert into public.companies (
    organization_id, name, legal_name, nif, activity, address, phone, email,
    regime, timezone, currency, fiscal_year_start_month
  ) values (
    v_org_id,
    btrim(v_company->>'name'),
    nullif(btrim(coalesce(v_company->>'legal_name', '')), ''),
    -- nif, address e phone sao NOT NULL com default '': passar NULL viola a
    -- restricao sempre que o utilizador deixa o campo vazio.
    coalesce(btrim(v_company->>'nif'), ''),
    nullif(btrim(coalesce(v_company->>'activity', '')), ''),
    coalesce(btrim(v_company->>'address'), ''),
    coalesce(btrim(v_company->>'phone'), ''),
    nullif(btrim(coalesce(v_company->>'email', '')), ''),
    coalesce(nullif(v_company->>'regime', ''), 'geral')::public.tax_regime,
    coalesce(nullif(v_company->>'timezone', ''), 'Africa/Luanda'),
    coalesce(nullif(v_company->>'currency', ''), 'AOA'),
    coalesce((v_company->>'fiscal_year_start_month')::smallint, 1)
  );

  -- O perfil passa a apontar para a organização antes de chamar as funções que
  -- verificam permissões, senão elas não veem o utilizador como membro.
  update public.profiles
  set full_name = coalesce(nullif(v_full_name, ''), full_name),
      current_org_id = v_org_id,
      onboarding_status = 'completed',
      onboarding_step = 6,
      onboarding_completed_at = now(),
      onboarding_draft = '{}'::jsonb,
      updated_at = now()
  where id = v_uid;

  insert into public.organization_financial_settings (organization_id, minimum_cash_buffer, updated_by)
  values (v_org_id, greatest(coalesce((p_payload->'financial'->>'minimum_cash_buffer')::numeric, 0), 0), v_uid)
  on conflict (organization_id) do update
    set minimum_cash_buffer = excluded.minimum_cash_buffer,
        updated_by = excluded.updated_by,
        updated_at = now();

  -- Conta inicial. O saldo de abertura entra pelo livro financeiro (a função
  -- existente cria o lançamento de opening_balance), nunca por escrita direta
  -- no saldo da conta.
  v_opening := greatest(coalesce((v_account->>'opening_balance')::numeric, 0), 0);

  perform public.create_account_with_balance(
    p_org_id := v_org_id,
    p_id := v_account_id,
    p_name := btrim(v_account->>'name'),
    p_type := coalesce(nullif(v_account->>'type', ''), 'bank')::public.account_type,
    p_bank := nullif(btrim(coalesce(v_account->>'bank', '')), ''),
    p_initial_balance := v_opening,
    p_idempotency_key := null
  );

  -- Contactos opcionais (etapa 4). Guardamos o id por nome para as obrigações.
  for v_contact in select * from jsonb_array_elements(coalesce(p_payload->'contacts', '[]'::jsonb))
  loop
    if btrim(coalesce(v_contact->>'name', '')) <> '' then
      v_contact_id := gen_random_uuid();
      insert into public.contacts (id, organization_id, name, kind)
      values (v_contact_id, v_org_id, btrim(v_contact->>'name'),
              coalesce(nullif(v_contact->>'kind', ''), 'cliente')::public.contact_kind);
      v_contact_ids := v_contact_ids || jsonb_build_object(v_contact->>'name', v_contact_id::text);
    end if;
  end loop;

  -- Obrigações opcionais (etapa 5), ligadas ao contacto criado acima.
  for v_obl in select * from jsonb_array_elements(coalesce(p_payload->'obligations', '[]'::jsonb))
  loop
    v_contact_id := nullif(v_contact_ids->>(v_obl->>'contact_name'), '')::uuid;
    if v_contact_id is not null and coalesce((v_obl->>'amount')::numeric, 0) > 0 then
      perform public.create_financial_obligation(
        p_org_id := v_org_id,
        p_direction := coalesce(nullif(v_obl->>'direction', ''), 'receivable')::public.obligation_direction,
        p_contact_id := v_contact_id,
        p_due_date := coalesce((v_obl->>'due_date')::date, current_date),
        p_amount := (v_obl->>'amount')::numeric,
        p_document_kind := case when coalesce(v_obl->>'direction', 'receivable') = 'receivable'
                                then 'invoice_reference' else 'supplier_invoice' end::public.obligation_document_kind,
        p_external_document_number := null,
        p_issue_date := current_date,
        p_currency := 'AOA',
        p_description := nullif(btrim(coalesce(v_obl->>'description', '')), ''),
        p_notes := null,
        p_category_id := null,
        p_is_sale := false
      );
    end if;
  end loop;

  -- audit_logs regista alterações de linhas (INSERT/UPDATE/DELETE), por isso o
  -- facto de ser um onboarding vai no corpo e não no campo action.
  insert into public.audit_logs (organization_id, user_id, table_name, record_id, action, new_data)
  values (v_org_id, v_uid, 'organizations', v_org_id, 'INSERT',
          jsonb_build_object('event', 'onboarding_completed',
                             'account_id', v_account_id,
                             'opening_balance', v_opening));

  return json_build_object('organization_id', v_org_id, 'account_id', v_account_id);
end;
$$;

revoke all on function public.complete_onboarding(jsonb) from public;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
