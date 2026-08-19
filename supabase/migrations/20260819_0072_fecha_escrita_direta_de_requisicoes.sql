-- Fase 1 do plano de evolução de permissões (auditoria apresentada em
-- 2026-08-19, aprovada pelo utilizador): fecha `requisitions`, a última
-- tabela financeira do projeto ainda com INSERT/UPDATE/DELETE diretos
-- concedidos a `authenticated`. Todas as outras (journal_entries,
-- financial_obligations, settlements, organization_members...) já só
-- aceitam escrita via RPC SECURITY DEFINER — esta migração alinha
-- requisitions ao mesmo padrão.
--
-- Três problemas [Crítico] confirmados na auditoria, todos com a mesma
-- causa raiz (policies de escrita sem filtro de dono nem de estado):
--
--   1. AUTOAPROVAÇÃO: `role_resource_permissions` dá can_write=true no
--      recurso 'requisitions' tanto a requisitante como a aprovador (mesmo
--      bit). approve_requisition(p_disburse=false) só verificava esse bit,
--      não quem criou a requisição — um requisitante conseguia aprovar a
--      própria requisição. Corrigido comparando requisitions.created_by
--      (coluna nova) com auth.uid() dentro da própria RPC.
--   2. DUPLO DESEMBOLSO: sem esta migração, UPDATE requisitions SET
--      status='pendente' sobre uma requisição já desembolsada reabre a
--      porta para approve_requisition(p_disburse=true) outra vez — a
--      função só verificava status<>'pendente', não se já existia um
--      journal_entry ligado. Fechado estruturalmente: já não há via de
--      UPDATE direto nenhuma, só RPCs que nunca fazem essa transição.
--   3. APAGAR REQUISIÇÕES DECIDIDAS: a policy de DELETE não olhava para o
--      estado — dava para apagar uma requisição já aprovada/desembolsada,
--      deixando o journal_entry associado órfão (viola a regra do charter
--      de nunca apagar movimentos confirmados em silêncio). Fechado: a
--      única via de apagar agora é delete_requisition_draft, que exige
--      status='pendente'.
--
-- Também acrescenta reject_requisition — não existia nenhuma RPC de
-- rejeição; hoje só era possível por UPDATE direto (sem motivo obrigatório,
-- sem checar que partia de 'pendente', mesma policy demasiado ampla).
--
-- created_by fica NULL nas requisições já existentes (não há como saber
-- retroativamente quem as criou). Todas as verificações de posse tratam
-- NULL como "não é o dono" para quem só tem a permissão estreita — falha
-- fechado, não aberto (mesmo padrão já usado em prevent_role_escalation,
-- ver 20260817_0071): só owner/admin/finance (user_writable_org_ids())
-- continuam a poder editar/apagar/decidir requisições antigas sem dono
-- registado.

alter table public.requisitions add column if not exists created_by uuid references auth.users(id);

-- ---- Fecha a tabela: só leitura direta; toda a escrita passa a ser RPC ----

revoke insert, update, delete on public.requisitions from authenticated;

drop policy if exists "Writers can insert requisitions" on public.requisitions;
drop policy if exists "Writers can update requisitions" on public.requisitions;
drop policy if exists "Writers can delete requisitions" on public.requisitions;
-- "Members can view requisitions" (SELECT) fica inalterada.

-- ---- create_requisition: substitui o INSERT direto do cliente ----
--
-- Força status='pendente' sempre (o cliente não pode criar já noutro
-- estado) e grava created_by=auth.uid() — é isto que torna possível
-- bloquear autoaprovação mais abaixo. Número gerado dentro da própria
-- transação com lock consultivo por organização, para não colidir sob
-- criação concorrente (o esquema RQ-XXX/MM/AAAA é o mesmo que o cliente já
-- usava; não passa pela sequência genérica next_document_number porque
-- essa exige user_writable_org_ids(), que um requisitante não tem).
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
  if p_org_id not in (select user_writable_org_ids()) and not user_can_write(p_org_id, 'requisitions') then
    raise exception 'Sem permissão';
  end if;
  if p_requester is null or btrim(p_requester) = '' then raise exception 'Requisitante obrigatório'; end if;
  if p_approver is null or btrim(p_approver) = '' then raise exception 'Aprovador obrigatório'; end if;
  if p_purpose is null or btrim(p_purpose) = '' then raise exception 'Finalidade obrigatória'; end if;
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
    coalesce(p_items, '[]'::jsonb), v_amount, coalesce(p_date, current_date), p_purpose, p_category,
    'pendente', p_type, p_beneficiary_contact_id, p_due_date, p_installments, p_recovery_method, v_uid
  );

  return json_build_object('id', v_id, 'number', v_number, 'amount', v_amount);
end; $function$;

revoke all on function public.create_requisition(uuid, text, text, text, jsonb, numeric, date, text, text, requisition_type, uuid, date, int, text) from public, anon;
grant execute on function public.create_requisition(uuid, text, text, text, jsonb, numeric, date, text, text, requisition_type, uuid, date, int, text) to authenticated;

-- ---- update_requisition_draft: substitui o UPDATE direto do cliente ----
--
-- p_patch é o mesmo objeto parcial que reqFieldsToDb() já construía no
-- frontend (só as chaves alteradas) — usa `p_patch ? 'chave'` para
-- distinguir "campo não veio no pedido" de "campo veio como null/vazio"
-- (necessário para poder LIMPAR beneficiary_contact_id/due_date/etc. ao
-- trocar o tipo de requisição de empréstimo para despesa normal).
create or replace function public.update_requisition_draft(p_req_id uuid, p_org_id uuid, p_patch jsonb)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
  v_items jsonb;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Só requisições pendentes podem ser editadas'; end if;

  if p_org_id not in (select user_writable_org_ids()) then
    if not user_can_write(p_org_id, 'requisitions') then raise exception 'Sem permissão'; end if;
    if v_req.created_by is distinct from v_uid then raise exception 'Só podes editar as tuas próprias requisições'; end if;
  end if;

  v_items := case when p_patch ? 'items' then p_patch->'items' else v_req.items end;
  v_amount := case
    when p_patch ? 'items' and jsonb_array_length(v_items) > 0
      then (select coalesce(sum((it->>'qty')::numeric * (it->>'unitPrice')::numeric), 0) from jsonb_array_elements(v_items) it)
    when p_patch ? 'amount' then (p_patch->>'amount')::numeric
    else v_req.amount
  end;
  if v_amount is null or v_amount <= 0 then raise exception 'O valor deve ser positivo'; end if;

  update requisitions set
    requester = case when p_patch ? 'requester' then p_patch->>'requester' else requester end,
    approver = case when p_patch ? 'approver' then p_patch->>'approver' else approver end,
    department = case when p_patch ? 'department' then nullif(p_patch->>'department', '') else department end,
    items = v_items,
    amount = v_amount,
    purpose = case when p_patch ? 'purpose' then p_patch->>'purpose' else purpose end,
    category = case when p_patch ? 'category' then p_patch->>'category' else category end,
    type = case when p_patch ? 'type' then (p_patch->>'type')::requisition_type else type end,
    beneficiary_contact_id = case when p_patch ? 'beneficiary_contact_id' then nullif(p_patch->>'beneficiary_contact_id', '')::uuid else beneficiary_contact_id end,
    due_date = case when p_patch ? 'due_date' then nullif(p_patch->>'due_date', '')::date else due_date end,
    installments = case when p_patch ? 'installments' then nullif(p_patch->>'installments', '')::int else installments end,
    recovery_method = case when p_patch ? 'recovery_method' then nullif(p_patch->>'recovery_method', '') else recovery_method end
  where id = p_req_id;

  return json_build_object('id', p_req_id);
end; $function$;

revoke all on function public.update_requisition_draft(uuid, uuid, jsonb) from public, anon;
grant execute on function public.update_requisition_draft(uuid, uuid, jsonb) to authenticated;

-- ---- delete_requisition_draft: substitui o DELETE direto do cliente ----
create or replace function public.delete_requisition_draft(p_req_id uuid, p_org_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Só requisições pendentes podem ser apagadas (já avançou no fluxo e serve para histórico)'; end if;

  if p_org_id not in (select user_writable_org_ids()) then
    if not user_can_write(p_org_id, 'requisitions') then raise exception 'Sem permissão'; end if;
    if v_req.created_by is distinct from v_uid then raise exception 'Só podes apagar as tuas próprias requisições'; end if;
  end if;

  delete from requisitions where id = p_req_id;
end; $function$;

revoke all on function public.delete_requisition_draft(uuid, uuid) from public, anon;
grant execute on function public.delete_requisition_draft(uuid, uuid) to authenticated;

-- ---- reject_requisition: nova — não existia nenhuma RPC de rejeição ----
create or replace function public.reject_requisition(p_req_id uuid, p_org_id uuid, p_reason text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_req requisitions;
  v_has_generic_write boolean;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Motivo da rejeição é obrigatório'; end if;

  v_has_generic_write := p_org_id in (select user_writable_org_ids());
  if not v_has_generic_write and not user_can_write(p_org_id, 'requisitions') then
    raise exception 'Sem permissão';
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req.id is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Requisição não está pendente'; end if;

  -- Mesma razão que approve_requisition bloqueia autoaprovação: quem criou
  -- não decide sobre a própria requisição quando só tem a permissão estreita
  -- de 'requisitions' — owner/admin/finance, com confiança mais ampla,
  -- continuam a poder.
  if not v_has_generic_write and v_req.created_by = v_uid then
    raise exception 'Não podes decidir sobre a tua própria requisição';
  end if;

  update requisitions set status = 'reprovado', reason = p_reason, decided_at = now() where id = p_req_id;
  return json_build_object('id', p_req_id, 'status', 'reprovado');
end; $function$;

revoke all on function public.reject_requisition(uuid, uuid, text) from public, anon;
grant execute on function public.reject_requisition(uuid, uuid, text) to authenticated;

-- ---- approve_requisition: fecha a via de autoaprovação [Crítico #1] ----
create or replace function public.approve_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid, p_disburse boolean DEFAULT true)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
  v_has_generic_write boolean;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  v_has_generic_write := p_org_id in (select user_writable_org_ids());

  if p_disburse then
    if not v_has_generic_write then raise exception 'Sem permissão'; end if;
  else
    if not v_has_generic_write and not user_can_write(p_org_id, 'requisitions') then
      raise exception 'Sem permissão';
    end if;
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'pendente' then raise exception 'Requisição não está pendente'; end if;

  if not v_has_generic_write and v_req.created_by = v_uid then
    raise exception 'Não podes aprovar a tua própria requisição';
  end if;

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

revoke all on function public.approve_requisition(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.approve_requisition(uuid, uuid, uuid, boolean) to authenticated;
