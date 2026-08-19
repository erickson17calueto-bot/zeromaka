-- Fase 4 do plano de evolução de permissões (auditoria 2026-08-19): tabela
-- account_assignments (utilizador↔conta) + restrição de caixa às contas
-- atribuídas — requisito 3 do pedido original ("Caixa limitado por
-- conta"). Não existia nenhuma estrutura de atribuição até agora.
--
-- Âmbito deliberadamente estreito: só disburse_requisition e
-- grant_employee_loan (as duas RPCs que caixa passou a poder chamar na
-- Fase 3/2) ficam sujeitas à restrição de conta, e só no CAMINHO de caixa
-- especificamente — owner/admin/finance (user_writable_org_ids()) e rh
-- (via user_can_write(org,'loans'), inalterado) continuam sem restrição
-- de conta nenhuma, exatamente como antes. Não estendido a post_settlement
-- (cobrador/pagador/rh) nesta fase — não foi pedido para esses papéis, e
-- a Fase 3 acabou de confirmar o comportamento deles ao vivo; alargar a
-- restrição de conta ali sem pedido explícito arriscava regressão não
-- pedida.
--
-- Lista de permissão (allowlist), falha fechado: uma conta só é acessível
-- a caixa depois de um owner/admin a atribuir explicitamente com
-- assign_account(). Sem atribuição nenhuma, caixa não desembolsa nada —
-- mesmo padrão de falha fechada já usado no resto desta evolução
-- (prevent_role_escalation, requisitions). Confirmado antes de aplicar:
-- a única organização real (CHEAR INVESTIMENT) não tem nenhum membro com
-- papel caixa hoje, por isso esta migração não bloqueia ninguém em
-- produção — só define o comportamento para quando o papel for atribuído.

create table if not exists public.account_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (organization_id, user_id, account_id)
);

create index if not exists idx_account_assignments_org_user on public.account_assignments (organization_id, user_id);

alter table public.account_assignments enable row level security;

drop policy if exists "account_assignments_select" on public.account_assignments;
create policy "account_assignments_select" on public.account_assignments for select
  using (organization_id in (select user_admin_org_ids()) or user_id = auth.uid());

revoke all on public.account_assignments from public, anon, authenticated;
grant select on public.account_assignments to authenticated;

create or replace function public.assign_account(p_org_id uuid, p_user_id uuid, p_account_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Sem permissão'; end if;
  if not exists (select 1 from organization_members where organization_id = p_org_id and user_id = p_user_id) then
    raise exception 'Utilizador não é membro desta organização';
  end if;
  if not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id and not is_archived) then
    raise exception 'Conta inválida ou arquivada';
  end if;

  insert into account_assignments (organization_id, user_id, account_id, created_by)
  values (p_org_id, p_user_id, p_account_id, v_uid)
  on conflict (organization_id, user_id, account_id) do nothing
  returning id into v_id;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (p_org_id, v_uid, 'INSERT', 'account_assignments', p_user_id, jsonb_build_object('account_id', p_account_id));

  return json_build_object('assigned', true);
end; $function$;

revoke all on function public.assign_account(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_account(uuid, uuid, uuid) to authenticated;

create or replace function public.unassign_account(p_org_id uuid, p_user_id uuid, p_account_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_admin_org_ids()) then raise exception 'Sem permissão'; end if;

  delete from account_assignments where organization_id = p_org_id and user_id = p_user_id and account_id = p_account_id;

  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (p_org_id, v_uid, 'DELETE', 'account_assignments', p_user_id, jsonb_build_object('account_id', p_account_id));

  return json_build_object('unassigned', true);
end; $function$;

revoke all on function public.unassign_account(uuid, uuid, uuid) from public, anon;
grant execute on function public.unassign_account(uuid, uuid, uuid) to authenticated;

-- ---- disburse_requisition: caminho de caixa passa a exigir atribuição ----
create or replace function public.disburse_requisition(p_req_id uuid, p_account_id uuid, p_org_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req requisitions;
  v_uid uuid := auth.uid();
  v_eid uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then
    if not user_can_do(p_org_id, 'requisitions', 'disburse') then raise exception 'Sem permissão'; end if;
    if not exists (select 1 from account_assignments where organization_id = p_org_id and user_id = v_uid and account_id = p_account_id) then
      raise exception 'Não tens esta conta atribuída';
    end if;
  end if;

  select * into v_req from requisitions where id = p_req_id and organization_id = p_org_id for update;
  if v_req is null then raise exception 'Requisição não encontrada'; end if;
  if v_req.status <> 'aguardando_desembolso' then raise exception 'Requisição não está a aguardar desembolso'; end if;

  v_eid := _disburse_requisition_ledger(v_req, p_account_id, p_org_id, v_uid);

  update requisitions set status = 'desembolsada', account_id = p_account_id, decided_at = now() where id = p_req_id;

  return json_build_object('requisition_id', p_req_id, 'status', 'desembolsada', 'entry_id', v_eid);
end; $function$;

-- ---- grant_employee_loan: completa o bit 'loans'.'disburse' da Fase 2 ----
-- (estava seedado para caixa desde a Fase 2 mas nenhuma RPC o consultava
-- ainda). rh continua pelo caminho antigo (user_can_write), sem restrição
-- de conta — só o caminho novo de caixa exige atribuição.
create or replace function public.grant_employee_loan(p_org_id uuid, p_contact_id uuid, p_account_id uuid, p_amount numeric, p_kind obligation_document_kind, p_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_document_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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
  if p_org_id not in (select user_writable_org_ids()) then
    if user_can_write(p_org_id, 'loans') then
      null; -- rh, caminho existente, sem restrição de conta
    elsif user_can_do(p_org_id, 'loans', 'disburse') then
      if not exists (select 1 from account_assignments where organization_id = p_org_id and user_id = v_uid and account_id = p_account_id) then
        raise exception 'Não tens esta conta atribuída';
      end if;
    else
      raise exception 'Sem permissão nesta organização';
    end if;
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
