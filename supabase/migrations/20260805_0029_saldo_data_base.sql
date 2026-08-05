-- Corrige o saldo atual de uma conta quando o utilizador define manualmente
-- um saldo de abertura "de hoje" e depois importa movimentos históricos.
--
-- Problema: o saldo atual somava TODOS os journal_lines da conta, para sempre,
-- sem olhar a data. Um saldo de abertura de 1.000.000 Kz configurado hoje já
-- reflete tudo o que aconteceu até hoje — se a seguir se importa uma despesa
-- de há 3 meses, essa despesa é passado contabilístico, não um novo movimento,
-- e não pode voltar a ser descontada ou o saldo fica errado.
--
-- Regra (data-base = data do lançamento opening_balance 'posted' mais recente
-- da conta):
--   saldo atual = valor desse opening_balance
--               + Σ movimentos posted com data entre a data-base e hoje (inclusive)
--   - movimentos com data ANTERIOR à data-base ficam no histórico e nos
--     relatórios, mas não entram no saldo atual (já estão implícitos no valor
--     de abertura).
--   - movimentos com data FUTURA também não entram (são previsão).
--   - a soma dos movimentos NÃO filtra por status: quando um lançamento é
--     revertido, o original fica 'reversed' mas as suas linhas continuam na
--     tabela — é a reversão (linhas opostas) que anula o efeito, não a
--     mudança de status. Excluir o original por status e manter só a
--     reversão desequilibraria a soma. Por isso a reversão usa sempre a data
--     do lançamento que reverte (nunca a sua própria data, que é "hoje"):
--     assim os dois ficam sempre do mesmo lado do corte de data.
--   - contas sem nenhum opening_balance 'posted' mantêm o comportamento
--     anterior (soma tudo, sem corte de data) — fallback seguro, não quebra
--     contas existentes que nunca tiveram este lançamento.
--
-- Não apaga nem altera lançamentos: é só uma forma diferente de os somar.

create or replace function public.current_account_balance(p_account_id uuid)
returns numeric
language sql
stable
as $$
  with base as (
    -- O opening_balance 'posted' mais recente desta conta. Empate na mesma
    -- data resolvido por posted_at/created_at, e por fim pelo id, para um
    -- resultado determinístico.
    select je.transaction_date as data_base, jl.amount as opening_amount
    from journal_entries je
    join journal_lines jl
      on jl.journal_entry_id = je.id and jl.account_id = p_account_id
    where je.entry_type = 'opening_balance'
      and je.status = 'posted'
    order by je.transaction_date desc, je.posted_at desc, je.created_at desc, je.id desc
    limit 1
  ),
  movements as (
    select case when jl.direction = 'debit' then jl.amount else -jl.amount end as signed_amount
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    -- Para uma reversão, a data que importa é a do lançamento revertido, não
    -- a da própria reversão (sempre "hoje") — ver nota acima.
    left join journal_entries orig on orig.id = je.reverses_entry_id
    where jl.account_id = p_account_id
      and je.entry_type <> 'opening_balance'
      and coalesce(orig.transaction_date, je.transaction_date)
            >= coalesce((select data_base from base), '-infinity'::date)
      and coalesce(orig.transaction_date, je.transaction_date) <= current_date
  )
  select (coalesce((select opening_amount from base), 0)
        + coalesce((select sum(signed_amount) from movements), 0))::numeric(20,2);
$$;

revoke all on function public.current_account_balance(uuid) from public, anon;
grant execute on function public.current_account_balance(uuid) to authenticated;

-- get_true_available_cash: mesma assinatura, mesma lógica de reservas,
-- compromissos, requisições e reserva mínima — só o saldo bruto das contas
-- passa a usar current_account_balance() em vez de somar tudo sem data-base.
create or replace function get_true_available_cash(
  p_org_id uuid, p_horizon_days int default null, p_account_id uuid default null
) returns json
language plpgsql security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_horizon int; v_horizon_end date;
  v_include_overdue boolean; v_include_reqs boolean; v_include_archived boolean;
  v_buffer numeric(20,2);
  v_balance numeric(20,2); v_reserves numeric(20,2);
  v_overdue_pay numeric(20,2); v_upcoming_pay numeric(20,2);
  v_covered numeric(20,2); v_uncovered numeric(20,2);
  v_reqs numeric(20,2); v_result numeric(20,2);
  v_accounts json; v_reserves_detail json; v_obligations_detail json; v_reqs_detail json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id and organization_id = p_org_id) then
    raise exception 'Conta não pertence a esta organização';
  end if;

  select coalesce(s.default_commitment_horizon_days, 7),
         coalesce(s.include_overdue_payables, true),
         coalesce(s.include_approved_requisitions, true),
         coalesce(s.include_archived_accounts, false),
         coalesce(s.minimum_cash_buffer, 0)
  into v_horizon, v_include_overdue, v_include_reqs, v_include_archived, v_buffer
  from (select 1) x left join organization_financial_settings s on s.organization_id = p_org_id;

  if p_horizon_days is not null then
    if p_horizon_days not in (7, 15, 30) then raise exception 'Horizonte deve ser 7, 15 ou 30 dias'; end if;
    v_horizon := p_horizon_days;
  end if;
  v_horizon_end := current_date + v_horizon;

  -- Saldo atual: data-base por conta (ver current_account_balance). Arquivadas:
  -- só se configurado ou se ainda têm saldo.
  with acc_bal as (
    select a.id, a.name, a.is_archived,
           public.current_account_balance(a.id)::numeric(20,2) as balance
    from accounts a
    where a.organization_id = p_org_id
      and (p_account_id is null or a.id = p_account_id)
  ), acc_inc as (
    select * from acc_bal where not is_archived or v_include_archived or balance <> 0
  )
  select coalesce(sum(balance), 0),
         coalesce(json_agg(json_build_object('id', id, 'name', name, 'balance', balance, 'archived', is_archived)), '[]'::json)
  into v_balance, v_accounts
  from acc_inc;

  -- Reservas ativas (por conta: filtradas quando p_account_id é dado; gerais contam sempre no total da org)
  select coalesce(sum(reserved_amount), 0),
         coalesce(json_agg(json_build_object('id', id, 'name', name, 'amount', reserved_amount, 'priority', priority, 'type', reserve_type, 'obligation_id', obligation_id)), '[]'::json)
  into v_reserves, v_reserves_detail
  from financial_reserves
  where organization_id = p_org_id
    and status in ('active','partially_released')
    and reserved_amount > 0
    and (p_account_id is null or account_id is null or account_id = p_account_id);

  -- Compromissos: payables abertas com pendente, no horizonte (+ vencidas se configurado).
  -- Cobertura: reservas ativas ligadas à obrigação, limitadas ao pendente (sem dupla contagem).
  with pay as (
    select os.id, os.internal_number, os.due_date, os.outstanding_amount,
           (os.due_date < current_date) as is_overdue,
           least(os.outstanding_amount, coalesce((
             select sum(r.reserved_amount) from financial_reserves r
             where r.obligation_id = os.id and r.status in ('active','partially_released')
           ), 0))::numeric(20,2) as covered
    from obligation_status os
    where os.organization_id = p_org_id
      and os.direction = 'payable'
      and os.lifecycle_status = 'open'
      and os.outstanding_amount > 0
      and (
        (os.due_date >= current_date and os.due_date <= v_horizon_end)
        or (v_include_overdue and os.due_date < current_date)
      )
  )
  select coalesce(sum(outstanding_amount) filter (where is_overdue), 0),
         coalesce(sum(outstanding_amount) filter (where not is_overdue), 0),
         coalesce(sum(covered), 0),
         coalesce(sum(outstanding_amount - covered), 0),
         coalesce(json_agg(json_build_object('id', id, 'number', internal_number, 'due_date', due_date, 'outstanding', outstanding_amount, 'covered', covered, 'uncovered', outstanding_amount - covered, 'overdue', is_overdue)), '[]'::json)
  into v_overdue_pay, v_upcoming_pay, v_covered, v_uncovered, v_obligations_detail
  from pay;

  -- Requisições aprovadas ainda sem lançamento no livro (hoje = 0 por desenho: aprovar lança de imediato)
  if v_include_reqs then
    select coalesce(sum(r.amount), 0),
           coalesce(json_agg(json_build_object('id', r.id, 'number', r.number, 'amount', r.amount)), '[]'::json)
    into v_reqs, v_reqs_detail
    from requisitions r
    where r.organization_id = p_org_id
      and r.status = 'aprovado'
      and not exists (
        select 1 from journal_entries je
        where je.organization_id = p_org_id
          and je.metadata->>'requisition_id' = r.id::text
          and je.status = 'posted'
      );
  else
    v_reqs := 0; v_reqs_detail := '[]'::json;
  end if;

  v_result := v_balance - v_reserves - v_uncovered - v_reqs - v_buffer;

  return json_build_object(
    'current_cash_balance', v_balance,
    'active_reserves_total', v_reserves,
    'minimum_cash_buffer', v_buffer,
    'overdue_payables_total', v_overdue_pay,
    'upcoming_payables_total', v_upcoming_pay,
    'approved_requisitions_total', v_reqs,
    'covered_obligations_total', v_covered,
    'uncovered_commitments_total', v_uncovered,
    'true_available_cash', v_result,
    'calculation_date', current_date,
    'horizon_days', v_horizon,
    'horizon_end_date', v_horizon_end,
    'safety_state', case
      when v_result <= 0 then 'critical'
      when v_balance > 0 and v_result < v_balance * 0.2 then 'warning'
      else 'safe'
    end,
    'breakdown', json_build_object(
      'accounts', v_accounts,
      'reserves', v_reserves_detail,
      'obligations', v_obligations_detail,
      'requisitions', v_reqs_detail
    )
  );
end; $$;

revoke all on function get_true_available_cash(uuid, int, uuid) from public, anon;
grant execute on function get_true_available_cash(uuid, int, uuid) to authenticated;
