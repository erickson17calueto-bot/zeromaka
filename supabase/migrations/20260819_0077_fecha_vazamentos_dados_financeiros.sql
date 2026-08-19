-- Fase 6 do plano de evolução de permissões (auditoria 2026-08-19),
-- achados [Alto]/[Médio]: três pontos verificavam só user_org_ids()
-- (pertença à organização) em vez do recurso granular, vazando dado
-- financeiro para papéis que não deviam vê-lo — em particular
-- requisitante, que segundo o pedido original não deve ver "dashboards,
-- relatórios, dívidas... nenhuma informação financeira".
--
--  1. refresh_financial_notifications: gerava notificações de VENCIDO/
--     A_VENCER para QUALQUER obrigação da organização, sem olhar a
--     document_kind nem direction — um requisitante recebia notificações
--     com valores e números de documento de obrigações a receber/pagar
--     que não tem permissão nenhuma para ver.
--  2. report_loans_position: os totais agregados (granted_period/
--     recovered_period) vêm direto de journal_entries filtrados só por
--     entry_type, sem checar user_can_view(org,'loans') — um caixa (tem
--     'ledger' mas não 'loans') via os totais em Kz de empréstimos.
--  3. file_attachments (policy file_attachments_select) + bucket
--     financial-attachments: só checavam pertença à organização — um
--     requisitante conseguia listar E DESCARREGAR anexos ligados a
--     obrigação/lançamento de qualquer tipo, incluindo empréstimos.
--
-- Novo helper user_can_view_attachment() centraliza a regra (mesmo
-- document_kind/entry_type usados no resto desta evolução) para não a
-- duplicar entre a tabela e o bucket de Storage — a policy do bucket
-- reaproveita-a por subquery, ligando storage.objects.name a
-- file_attachments.storage_path (o path é gravado como
-- "{organization_id}/{uuid}-{nome}", ver app/app/documentos/page.tsx).

create or replace function public.user_can_view_attachment(p_org_id uuid, p_entity_type text, p_entity_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select case
    when p_entity_id is null then public.user_can_view(p_org_id, 'ledger')
    when p_entity_type = 'obligation' then coalesce((
      select
        (fo.document_kind in ('employee_loan', 'salary_advance') and public.user_can_view(p_org_id, 'loans'))
        or (fo.document_kind not in ('employee_loan', 'salary_advance') and fo.direction = 'receivable' and public.user_can_view(p_org_id, 'obligations_receivable'))
        or (fo.document_kind not in ('employee_loan', 'salary_advance') and fo.direction = 'payable' and public.user_can_view(p_org_id, 'obligations_payable'))
      from public.financial_obligations fo
      where fo.id = p_entity_id and fo.organization_id = p_org_id
    ), false)
    when p_entity_type = 'journal_entry' then coalesce((
      select
        (je.entry_type in ('loan_disbursement', 'salary_advance_disbursement', 'loan_repayment', 'salary_advance_repayment') and public.user_can_view(p_org_id, 'loans'))
        or (je.entry_type not in ('loan_disbursement', 'salary_advance_disbursement', 'loan_repayment', 'salary_advance_repayment') and public.user_can_view(p_org_id, 'ledger'))
      from public.journal_entries je
      where je.id = p_entity_id and je.organization_id = p_org_id
    ), false)
    else public.user_can_view(p_org_id, 'ledger')
  end;
$function$;

revoke all on function public.user_can_view_attachment(uuid, text, uuid) from public, anon;
grant execute on function public.user_can_view_attachment(uuid, text, uuid) to authenticated;

-- ---- 1. file_attachments: SELECT passa a exigir o recurso certo ----
drop policy if exists "file_attachments_select" on public.file_attachments;
create policy "file_attachments_select" on public.file_attachments for select
using (
  organization_id in (select user_org_ids())
  and not is_deleted
  and user_can_view_attachment(organization_id, entity_type, entity_id)
);

-- ---- 2. bucket financial-attachments: mesma regra, via storage_path ----
drop policy if exists "financial_attachments_select" on storage.objects;
create policy "financial_attachments_select" on storage.objects for select
using (
  bucket_id = 'financial-attachments'
  and (storage.foldername(name))[1]::uuid in (select user_org_ids())
  and exists (
    select 1 from public.file_attachments fa
    where fa.storage_path = name
      and fa.organization_id = (storage.foldername(name))[1]::uuid
      and not fa.is_deleted
      and public.user_can_view_attachment(fa.organization_id, fa.entity_type, fa.entity_id)
  )
);

-- ---- 3. refresh_financial_notifications: filtra por recurso granular ----
create or replace function public.refresh_financial_notifications(p_org_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_inserted integer := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;

  insert into financial_notifications (organization_id, user_id, kind, title, body, href, dedupe_key, metadata)
  select o.organization_id, v_uid, 'overdue',
    'Documento vencido',
    coalesce(o.internal_number, 'Documento') || ' tem ' || to_char(o.outstanding_amount, 'FM999G999G990D00') || ' Kz em aberto.',
    case when o.direction = 'receivable' then '/faturas' else '/contas-a-pagar' end,
    'overdue:' || o.id::text || ':' || o.due_date::text,
    jsonb_build_object('obligation_id', o.id, 'direction', o.direction)
  from obligation_status o
  where o.organization_id = p_org_id and o.financial_status in ('overdue', 'partial_overdue')
    and (
      (o.document_kind in ('employee_loan', 'salary_advance') and user_can_view(p_org_id, 'loans'))
      or (o.document_kind not in ('employee_loan', 'salary_advance') and o.direction = 'receivable' and user_can_view(p_org_id, 'obligations_receivable'))
      or (o.document_kind not in ('employee_loan', 'salary_advance') and o.direction = 'payable' and user_can_view(p_org_id, 'obligations_payable'))
    )
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;
  v_count := v_inserted;

  insert into financial_notifications (organization_id, user_id, kind, title, body, href, dedupe_key, metadata)
  select o.organization_id, v_uid, 'due_soon',
    'Vencimento próximo',
    coalesce(o.internal_number, 'Documento') || ' vence em ' || o.due_date::text || '.',
    case when o.direction = 'receivable' then '/faturas' else '/contas-a-pagar' end,
    'due_soon:' || o.id::text || ':' || o.due_date::text,
    jsonb_build_object('obligation_id', o.id, 'direction', o.direction)
  from obligation_status o
  where o.organization_id = p_org_id
    and o.due_date between current_date and current_date + 7
    and o.financial_status not in ('cancelled', 'paid', 'overdue', 'partial_overdue')
    and (
      (o.document_kind in ('employee_loan', 'salary_advance') and user_can_view(p_org_id, 'loans'))
      or (o.document_kind not in ('employee_loan', 'salary_advance') and o.direction = 'receivable' and user_can_view(p_org_id, 'obligations_receivable'))
      or (o.document_kind not in ('employee_loan', 'salary_advance') and o.direction = 'payable' and user_can_view(p_org_id, 'obligations_payable'))
    )
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;
  v_count := v_count + v_inserted;

  return json_build_object('created', v_count);
end;
$function$;

-- ---- 4. report_loans_position: exige explicitamente 'loans' ----
create or replace function public.report_loans_position(p_org_id uuid, p_start date, p_end date)
 returns json
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if not user_can_view(p_org_id, 'loans') then raise exception 'Sem permissão nesta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  return json_build_object(
    'meta', json_build_object('report', 'loans_position', 'title', 'Posição de empréstimos e adiantamentos', 'start', p_start, 'end', p_end),
    'employees', coalesce((
      select json_agg(json_build_object(
        'contact_id', c.id, 'contact_name', c.name,
        'outstanding', coalesce(emp.outstanding, 0), 'overdue', coalesce(emp.overdue, 0),
        'granted_period', coalesce(gp.granted, 0), 'recovered_period', coalesce(rp.recovered, 0),
        'loans_open', emp.loans_open, 'advances_open', emp.advances_open
      ) order by emp.outstanding desc)
      from (
        select os.contact_id,
          sum(os.outstanding_amount) filter (where os.lifecycle_status = 'open') as outstanding,
          sum(os.outstanding_amount) filter (where os.lifecycle_status = 'open' and os.days_overdue > 0) as overdue,
          count(*) filter (where os.lifecycle_status = 'open' and os.document_kind = 'employee_loan') as loans_open,
          count(*) filter (where os.lifecycle_status = 'open' and os.document_kind = 'salary_advance') as advances_open
        from obligation_status os
        where os.organization_id = p_org_id and os.document_kind in ('employee_loan', 'salary_advance')
        group by os.contact_id
      ) emp
      join contacts c on c.id = emp.contact_id
      left join (
        select o.contact_id, sum(jl.amount) as granted
        from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
        join financial_obligations o on o.disbursement_entry_id = je.id
        where je.organization_id = p_org_id and je.entry_type in ('loan_disbursement', 'salary_advance_disbursement')
          and je.transaction_date between p_start and p_end
        group by o.contact_id
      ) gp on gp.contact_id = emp.contact_id
      left join (
        select o.contact_id, sum(a.allocated_amount) as recovered
        from settlement_allocations a
        join settlements s on s.id = a.settlement_id and s.status = 'posted'
        join financial_obligations o on o.id = a.obligation_id
        where s.organization_id = p_org_id and o.document_kind in ('employee_loan', 'salary_advance')
          and s.payment_date between p_start and p_end
        group by o.contact_id
      ) rp on rp.contact_id = emp.contact_id
    ), '[]'::json),
    'totals', json_build_object(
      'outstanding', coalesce((select sum(outstanding_amount) from obligation_status where organization_id = p_org_id and document_kind in ('employee_loan', 'salary_advance') and lifecycle_status = 'open'), 0),
      'overdue', coalesce((select sum(outstanding_amount) from obligation_status where organization_id = p_org_id and document_kind in ('employee_loan', 'salary_advance') and lifecycle_status = 'open' and days_overdue > 0), 0),
      'granted_period', coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = p_org_id and je.entry_type in ('loan_disbursement', 'salary_advance_disbursement') and je.transaction_date between p_start and p_end), 0),
      'recovered_period', coalesce((select sum(jl.amount) from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id where je.organization_id = p_org_id and je.entry_type in ('loan_repayment', 'salary_advance_repayment') and je.transaction_date between p_start and p_end), 0)
    )
  );
end; $function$;
