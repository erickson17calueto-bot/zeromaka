-- Reestruturação de categorias/subcategorias e campos de documento nos
-- lançamentos, faturas e liquidações.
--
-- Contexto: financial_categories já tinha parent_id desde a Fase 2, mas (a)
-- a constraint de unicidade não o considerava — duas subcategorias com o
-- mesmo nome sob mães diferentes colidiam por engano, e duas categorias
-- principais com o mesmo nome nunca colidiam corretamente porque a coluna
-- parent_id (NULL nas duas) tornava a comparação sempre "diferente"; (b) não
-- existia nenhuma função para criar/editar/arquivar categorias — só o seed
-- inicial; (c) journal_entries só tinha um campo `reference` livre, sem
-- distinguir tipo de documento, número, data ou observação.
--
-- Mapeamento de campos "documento" pedido, usando o que já existe em vez de
-- duplicar: `reference` (já existente em journal_entries e settlements)
-- continua a servir de referência bancária/pagamento — é exatamente isso que
-- já fazia na Fase 1/2 da importação. document_number é o número do PRÓPRIO
-- documento (fatura/recibo/nota), distinto da referência bancária. Não se
-- cria uma segunda coluna "document_reference" redundante com `reference`.

-- ---------- 1) financial_categories: unicidade correta + CRUD ----------

alter table public.financial_categories
  drop constraint if exists financial_categories_organization_id_name_category_type_key;

-- NULLS NOT DISTINCT (PG15+): duas categorias principais (parent_id NULL) do
-- mesmo tipo com o mesmo nome também colidem — antes disso NÃO colidiam,
-- porque NULL <> NULL faz uma unique constraint normal ignorar a duplicação.
alter table public.financial_categories
  add constraint financial_categories_org_parent_type_name_key
  unique nulls not distinct (organization_id, parent_id, category_type, name);

create or replace function public.create_financial_category(
  p_org_id uuid, p_name text, p_category_type fin_category_type, p_parent_id uuid default null
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_parent record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'Nome obrigatório'; end if;

  if p_parent_id is not null then
    select * into v_parent from financial_categories where id = p_parent_id and organization_id = p_org_id;
    if v_parent.id is null then raise exception 'Categoria principal não encontrada nesta organização'; end if;
    if v_parent.parent_id is not null then raise exception 'Uma subcategoria não pode ter outra subcategoria como categoria principal'; end if;
    if v_parent.category_type <> p_category_type then raise exception 'A subcategoria tem de ser do mesmo tipo (entrada/saída) da categoria principal'; end if;
  end if;

  insert into financial_categories (id, organization_id, name, category_type, parent_id, is_system, created_by)
  values (v_id, p_org_id, btrim(p_name), p_category_type, p_parent_id, false, v_uid);
  return json_build_object('id', v_id);
exception when unique_violation then
  raise exception 'Já existe uma categoria com este nome neste grupo';
end; $$;

create or replace function public.update_financial_category(p_id uuid, p_name text) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_cat record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_cat from financial_categories where id = p_id;
  if v_cat.id is null then raise exception 'Categoria não encontrada'; end if;
  if v_cat.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'Nome obrigatório'; end if;
  update financial_categories set name = btrim(p_name), updated_at = now() where id = p_id;
  return json_build_object('id', p_id);
exception when unique_violation then
  raise exception 'Já existe uma categoria com este nome neste grupo';
end; $$;

create or replace function public.archive_financial_category(p_id uuid) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_cat record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_cat from financial_categories where id = p_id;
  if v_cat.id is null then raise exception 'Categoria não encontrada'; end if;
  if v_cat.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  update financial_categories set is_active = false, updated_at = now() where id = p_id;
  -- Arquivar a mãe arquiva também as subcategorias — não faz sentido manter
  -- subcategorias "ativas" de um grupo escondido de novos lançamentos.
  update financial_categories set is_active = false, updated_at = now() where parent_id = p_id and is_active;
  return json_build_object('id', p_id);
end; $$;

create or replace function public.reactivate_financial_category(p_id uuid) returns json
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_cat record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  select * into v_cat from financial_categories where id = p_id;
  if v_cat.id is null then raise exception 'Categoria não encontrada'; end if;
  if v_cat.organization_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  update financial_categories set is_active = true, updated_at = now() where id = p_id;
  -- Reativar uma subcategoria cuja mãe está arquivada reativa também a mãe —
  -- uma subcategoria "ativa" sob uma mãe arquivada seria um estado inconsistente.
  if v_cat.parent_id is not null then
    update financial_categories set is_active = true, updated_at = now() where id = v_cat.parent_id and not is_active;
  else
    -- Reativar uma categoria principal reativa as subcategorias que tinham
    -- sido arquivadas em cascata com ela (simétrico a archive_financial_category).
    update financial_categories set is_active = true, updated_at = now() where parent_id = p_id and not is_active;
  end if;
  return json_build_object('id', p_id);
end; $$;

revoke all on function public.create_financial_category(uuid, text, fin_category_type, uuid) from public, anon;
revoke all on function public.update_financial_category(uuid, text) from public, anon;
revoke all on function public.archive_financial_category(uuid) from public, anon;
revoke all on function public.reactivate_financial_category(uuid) from public, anon;
grant execute on function public.create_financial_category(uuid, text, fin_category_type, uuid) to authenticated;
grant execute on function public.update_financial_category(uuid, text) to authenticated;
grant execute on function public.archive_financial_category(uuid) to authenticated;
grant execute on function public.reactivate_financial_category(uuid) to authenticated;

-- ---------- 2) Taxonomia inicial completa (idempotente) ----------
-- Reescreve seed_default_categories com a árvore completa de entradas/saídas.
-- ON CONFLICT DO NOTHING em ambas as passagens: organizações que já
-- personalizaram/renomearam categorias não perdem nada; só ganham as que
-- ainda não têm.

create or replace function public.seed_default_categories(p_org_id uuid)
returns void
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  create temp table if not exists _seed_categories (
    category_type text, parent_name text, name text
  ) on commit drop;
  delete from _seed_categories;

  insert into _seed_categories (category_type, parent_name, name) values
    -- Entradas
    ('income', null, 'Vendas de produtos'),
    ('income', 'Vendas de produtos', 'Venda de mercadoria'),
    ('income', 'Vendas de produtos', 'Venda de equipamentos'),
    ('income', 'Vendas de produtos', 'Venda de produtos diversos'),
    ('income', null, 'Prestação de serviços'),
    ('income', 'Prestação de serviços', 'Consultoria'),
    ('income', 'Prestação de serviços', 'Desenvolvimento'),
    ('income', 'Prestação de serviços', 'Manutenção'),
    ('income', 'Prestação de serviços', 'Design'),
    ('income', 'Prestação de serviços', 'Marketing'),
    ('income', 'Prestação de serviços', 'Formação'),
    ('income', 'Prestação de serviços', 'Outros serviços'),
    ('income', null, 'Recebimentos de clientes'),
    ('income', 'Recebimentos de clientes', 'Recebimento de fatura'),
    ('income', 'Recebimentos de clientes', 'Adiantamento de cliente'),
    ('income', 'Recebimentos de clientes', 'Sinal'),
    ('income', null, 'Outros rendimentos'),
    ('income', 'Outros rendimentos', 'Comissões'),
    ('income', 'Outros rendimentos', 'Juros recebidos'),
    ('income', 'Outros rendimentos', 'Reembolsos recebidos'),
    ('income', 'Outros rendimentos', 'Outros rendimentos'),
    ('income', null, 'Financiamento e capital'),
    ('income', 'Financiamento e capital', 'Aporte de sócio'),
    ('income', 'Financiamento e capital', 'Empréstimo recebido'),
    ('income', 'Financiamento e capital', 'Reembolso de empréstimo'),
    ('income', null, 'Transferências internas'),
    ('income', 'Transferências internas', 'Transferência entre contas'),
    ('income', 'Transferências internas', 'Transferência para caixa'),
    ('income', 'Transferências internas', 'Transferência para banco'),
    -- Saídas
    ('expense', null, 'Consumíveis'),
    ('expense', 'Consumíveis', 'Material de escritório'),
    ('expense', 'Consumíveis', 'Material de limpeza'),
    ('expense', 'Consumíveis', 'Água e bebidas'),
    ('expense', 'Consumíveis', 'Material de embalagem'),
    ('expense', 'Consumíveis', 'Consumíveis operacionais'),
    ('expense', null, 'Compras e mercadorias'),
    ('expense', 'Compras e mercadorias', 'Compra de mercadoria'),
    ('expense', 'Compras e mercadorias', 'Compra de matéria-prima'),
    ('expense', 'Compras e mercadorias', 'Compra de equipamentos'),
    ('expense', 'Compras e mercadorias', 'Stock'),
    ('expense', null, 'Pessoal'),
    ('expense', 'Pessoal', 'Salários'),
    ('expense', 'Pessoal', 'Subsídios'),
    ('expense', 'Pessoal', 'Segurança social'),
    ('expense', 'Pessoal', 'Prestadores individuais'),
    ('expense', 'Pessoal', 'Formação de pessoal'),
    ('expense', null, 'Instalações'),
    ('expense', 'Instalações', 'Renda'),
    ('expense', 'Instalações', 'Água'),
    ('expense', 'Instalações', 'Eletricidade'),
    ('expense', 'Instalações', 'Condomínio'),
    ('expense', 'Instalações', 'Segurança'),
    ('expense', 'Instalações', 'Reparações'),
    ('expense', null, 'Telecomunicações e tecnologia'),
    ('expense', 'Telecomunicações e tecnologia', 'Internet'),
    ('expense', 'Telecomunicações e tecnologia', 'Telefone'),
    ('expense', 'Telecomunicações e tecnologia', 'Software'),
    ('expense', 'Telecomunicações e tecnologia', 'Domínios e alojamento'),
    ('expense', 'Telecomunicações e tecnologia', 'Equipamentos informáticos'),
    ('expense', 'Telecomunicações e tecnologia', 'Serviços digitais'),
    ('expense', null, 'Transporte e logística'),
    ('expense', 'Transporte e logística', 'Combustível'),
    ('expense', 'Transporte e logística', 'Táxi e transporte'),
    ('expense', 'Transporte e logística', 'Entregas'),
    ('expense', 'Transporte e logística', 'Manutenção de viaturas'),
    ('expense', 'Transporte e logística', 'Portagens'),
    ('expense', null, 'Marketing e vendas'),
    ('expense', 'Marketing e vendas', 'Publicidade'),
    ('expense', 'Marketing e vendas', 'Anúncios online'),
    ('expense', 'Marketing e vendas', 'Eventos'),
    ('expense', 'Marketing e vendas', 'Comissões comerciais'),
    ('expense', 'Marketing e vendas', 'Material promocional'),
    ('expense', null, 'Serviços profissionais'),
    ('expense', 'Serviços profissionais', 'Contabilidade'),
    ('expense', 'Serviços profissionais', 'Jurídico'),
    ('expense', 'Serviços profissionais', 'Consultoria'),
    ('expense', 'Serviços profissionais', 'Auditoria'),
    ('expense', 'Serviços profissionais', 'Design'),
    ('expense', 'Serviços profissionais', 'Freelancers'),
    ('expense', null, 'Impostos, taxas e encargos'),
    ('expense', 'Impostos, taxas e encargos', 'IVA'),
    ('expense', 'Impostos, taxas e encargos', 'Imposto de selo'),
    ('expense', 'Impostos, taxas e encargos', 'Taxas administrativas'),
    ('expense', 'Impostos, taxas e encargos', 'Licenças'),
    ('expense', 'Impostos, taxas e encargos', 'Multas'),
    ('expense', null, 'Bancos e pagamentos'),
    ('expense', 'Bancos e pagamentos', 'Comissões bancárias'),
    ('expense', 'Bancos e pagamentos', 'Taxas de processamento'),
    ('expense', 'Bancos e pagamentos', 'Encargos financeiros'),
    ('expense', null, 'Alimentação e representação'),
    ('expense', 'Alimentação e representação', 'Alimentação'),
    ('expense', 'Alimentação e representação', 'Alojamento'),
    ('expense', 'Alimentação e representação', 'Representação'),
    ('expense', 'Alimentação e representação', 'Ajudas de custo'),
    ('expense', null, 'Financiamento'),
    ('expense', 'Financiamento', 'Pagamento de empréstimo'),
    ('expense', 'Financiamento', 'Juros pagos'),
    ('expense', 'Financiamento', 'Leasing'),
    ('expense', null, 'Sócios'),
    ('expense', 'Sócios', 'Retirada de sócio'),
    ('expense', 'Sócios', 'Distribuição de lucros'),
    ('expense', null, 'Transferências internas'),
    ('expense', 'Transferências internas', 'Transferência entre contas'),
    ('expense', 'Transferências internas', 'Transferência para caixa'),
    ('expense', 'Transferências internas', 'Transferência para banco'),
    -- Categorias já existentes (Fase 1) que não estão na lista acima, mas
    -- continuam semeadas para não quebrar organizações já criadas.
    ('expense', null, 'Fornecedores'),
    ('expense', null, 'Outras despesas'),
    ('expense', 'Outras despesas', 'Limpeza'),
    ('expense', 'Outras despesas', 'Bancárias'),
    ('expense', 'Outras despesas', 'Taxas e licenças'),
    ('expense', 'Outras despesas', 'Diversos'),
    ('income', null, 'Outros recebimentos')
  on conflict do nothing;

  insert into financial_categories (organization_id, name, category_type, is_system, created_by)
  select p_org_id, s.name, s.category_type::fin_category_type, true, v_uid
  from _seed_categories s where s.parent_name is null
  on conflict (organization_id, parent_id, category_type, name) do nothing;

  insert into financial_categories (organization_id, name, category_type, is_system, created_by, parent_id)
  select p_org_id, s.name, s.category_type::fin_category_type, true, v_uid, parent.id
  from _seed_categories s
  join financial_categories parent
    on parent.organization_id = p_org_id
   and parent.category_type = s.category_type::fin_category_type
   and parent.name = s.parent_name
   and parent.parent_id is null
  where s.parent_name is not null
  on conflict (organization_id, parent_id, category_type, name) do nothing;
end; $$;

-- Organizações já existentes ganham a taxonomia nova (só o que ainda não
-- tinham — a função é idempotente, categorias renomeadas ou personalizadas
-- pelo utilizador não são tocadas).
do $$
declare v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_default_categories(v_org.id);
  end loop;
end $$;

-- ---------- 3) Documento nos lançamentos e liquidações ----------

do $$ begin
  create type public.entry_document_kind as enum (
    'invoice', 'receipt', 'credit_note', 'debit_note', 'purchase_order',
    'contract', 'bank_proof', 'ticket', 'internal', 'other', 'none'
  );
exception when duplicate_object then null; end $$;

alter table public.journal_entries
  add column if not exists document_kind public.entry_document_kind,
  add column if not exists document_number text,
  add column if not exists document_date date,
  add column if not exists document_notes text;

alter table public.settlements
  add column if not exists document_kind public.entry_document_kind,
  add column if not exists document_number text;

-- post_income / post_expense / post_settlement: acrescentam parâmetros no
-- fim. CREATE OR REPLACE sozinho criaria uma segunda função sobrecarregada
-- em vez de substituir (a assinatura muda) — por isso o DROP explícito da
-- assinatura antiga primeiro, mesmo padrão já usado para post_settlement na
-- Fase 4b (20260724_0007_reserves_rpcs.sql). Chamadas existentes com nomes
-- de parâmetro (`p_org_id := ...`) continuam a funcionar sem alterações —
-- os novos parâmetros ficam simplesmente por preencher (NULL).
drop function if exists public.post_income(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb);
drop function if exists public.post_expense(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb);
drop function if exists public.post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid, uuid);

create or replace function public.post_income(
  p_org_id uuid, p_account_id uuid, p_amount numeric, p_description text,
  p_date date default current_date, p_category_id uuid default null,
  p_contact_id uuid default null, p_reference text default null,
  p_idempotency_key uuid default null, p_metadata jsonb default '{}'::jsonb,
  p_document_kind entry_document_kind default null, p_document_number text default null,
  p_document_date date default null, p_document_notes text default null
) returns json
language plpgsql
as $$
declare
  v_uid uuid := auth.uid(); v_eid uuid := gen_random_uuid(); v_num text;
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid()); v_ex record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão para lançar nesta organização'; end if;
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
end; $$;

create or replace function public.post_expense(
  p_org_id uuid, p_account_id uuid, p_amount numeric, p_description text,
  p_date date default current_date, p_category_id uuid default null,
  p_contact_id uuid default null, p_reference text default null,
  p_idempotency_key uuid default null, p_metadata jsonb default '{}'::jsonb,
  p_document_kind entry_document_kind default null, p_document_number text default null,
  p_document_date date default null, p_document_notes text default null
) returns json
language plpgsql
as $$
declare
  v_uid uuid := auth.uid(); v_eid uuid := gen_random_uuid(); v_num text;
  v_idem uuid := coalesce(p_idempotency_key, gen_random_uuid()); v_ex record;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão para lançar nesta organização'; end if;
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
end; $$;

-- post_settlement: dois parâmetros novos (documento da liquidação, ex.
-- "Comprovativo bancário"), propagados também ao journal_entry que a
-- liquidação gera — a mesma prova de pagamento fica visível nos dois sítios.
create or replace function public.post_settlement(
  p_org_id uuid, p_direction settlement_direction, p_contact_id uuid, p_account_id uuid,
  p_allocations jsonb, p_payment_date date default current_date,
  p_payment_method text default null, p_reference text default null,
  p_notes text default null, p_idempotency_key uuid default null,
  p_reserve_id uuid default null,
  p_document_kind entry_document_kind default null, p_document_number text default null
) returns json
language plpgsql security definer set search_path = public
as $$
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
    select category_id, internal_number, is_sale into v_cat, v_int, v_is_sale from financial_obligations where id = v_ob_id;
    v_use_cat := null;
    if v_cat is not null then
      select category_type into v_cat_type from financial_categories where id = v_cat;
      if p_direction = 'incoming' and v_cat_type = 'income' then v_use_cat := v_cat; end if;
      if p_direction = 'outgoing' and v_cat_type = 'expense' then v_use_cat := v_cat; end if;
    end if;
    v_desc := case when p_direction = 'incoming' then 'Recebimento ' else 'Pagamento ' end || v_int || ' (' || v_num || ')';
    v_meta := jsonb_build_object('settlement_id', v_sid, 'obligation_id', v_ob_id, 'kind', 'settlement');
    if p_direction = 'incoming' and v_is_sale and v_rate > 0 then
      v_meta := v_meta || jsonb_build_object('is_sale', true, 'tax_amount', coalesce(org_sale_tax(p_org_id, v_amt), 0));
    end if;
    if p_direction = 'incoming' then
      v_res := post_income(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), v_meta, p_document_kind, v_doc_number, p_payment_date, null);
    else
      v_res := post_expense(p_org_id, p_account_id, v_amt, v_desc, p_payment_date, v_use_cat, p_contact_id, p_reference, gen_random_uuid(), v_meta, p_document_kind, v_doc_number, p_payment_date, null);
    end if;
    v_entry_id := (v_res->>'id')::uuid;
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
end; $$;

revoke all on function public.post_income(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb, entry_document_kind, text, date, text) from public, anon;
revoke all on function public.post_expense(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb, entry_document_kind, text, date, text) from public, anon;
revoke all on function public.post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid, uuid, entry_document_kind, text) from public, anon;
grant execute on function public.post_income(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb, entry_document_kind, text, date, text) to authenticated;
grant execute on function public.post_expense(uuid, uuid, numeric, text, date, uuid, uuid, text, uuid, jsonb, entry_document_kind, text, date, text) to authenticated;
grant execute on function public.post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid, uuid, entry_document_kind, text) to authenticated;
