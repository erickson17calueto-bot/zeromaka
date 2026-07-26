-- Extrato de conta (razão): saldo inicial, movimentos com saldo corrido, saldo final.
--
-- Convenção de sinais igual à do resto da app (ver get_true_available_cash):
--   saldo = soma(débitos) - soma(créditos), SEM filtro de estado.
-- Os lançamentos 'reversed' e os respetivos 'reversal' anulam-se entre si, por
-- isso somar tudo dá o saldo correto. O extrato MOSTRA ambos (nunca esconde um
-- estorno) — é o que torna o documento auditável.
--
-- Verificado contra o saldo autoritativo da conta, incluindo período que começa
-- a meio (saldo inicial != 0) e conta com estornos.
create or replace function report_account_ledger(
  p_org_id     uuid,
  p_start      date,
  p_end        date,
  p_account_id uuid default null
) returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_acc_name text;
  v_opening  numeric;
  v_in       numeric;
  v_out      numeric;
  v_rows     json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;
  if p_account_id is null then raise exception 'Escolhe uma conta para ver o extrato'; end if;

  -- a conta tem de pertencer à organização pedida
  select a.name into v_acc_name
  from accounts a where a.id = p_account_id and a.organization_id = p_org_id;
  if v_acc_name is null then raise exception 'Conta não encontrada nesta organização'; end if;

  -- saldo inicial: tudo o que aconteceu ANTES do início do período
  select coalesce(sum(case when jl.direction = 'debit' then jl.amount else -jl.amount end), 0)
    into v_opening
  from journal_lines jl
  join journal_entries je on je.id = jl.journal_entry_id
  where jl.account_id = p_account_id
    and je.organization_id = p_org_id
    and je.transaction_date < p_start;

  with mov as (
    select je.transaction_date as data,
           coalesce(je.entry_number,'—')                        as numero,
           coalesce(nullif(je.description,''),'Sem descrição')   as descricao,
           coalesce(c.name,'—')                                  as contacto,
           je.entry_type::text                                   as tipo,
           je.status::text                                       as estado,
           case when jl.direction = 'debit' then jl.amount else 0 end as entrada,
           case when jl.direction = 'credit' then jl.amount else 0 end as saida,
           case when jl.direction = 'debit' then jl.amount else -jl.amount end as sinal,
           je.transaction_date, je.entry_number, jl.id as line_id
    from journal_lines jl
    join journal_entries je on je.id = jl.journal_entry_id
    left join contacts c on c.id = je.contact_id
    where jl.account_id = p_account_id
      and je.organization_id = p_org_id
      and je.transaction_date between p_start and p_end
  ),
  -- saldo corrido: ordem estável (data, nº lançamento, id da linha)
  ord as (
    select m.*,
           v_opening + sum(m.sinal) over (
             order by m.transaction_date, m.entry_number, m.line_id
             rows between unbounded preceding and current row
           ) as saldo
    from mov m
  )
  select coalesce(json_agg(json_build_object(
           'data',data,'numero',numero,'descricao',descricao,'contacto',contacto,
           'tipo',tipo,'estado',estado,
           'entrada',entrada,'saida',saida,'saldo',saldo)
         order by transaction_date, entry_number, line_id), '[]'::json),
         coalesce(sum(entrada),0), coalesce(sum(saida),0)
    into v_rows, v_in, v_out
  from ord;

  return json_build_object(
    'meta', json_build_object('report','account_ledger','basis','cash','currency','AOA',
      'title','Extrato de Conta','start',p_start,'end',p_end,
      'cmp_start',null,'cmp_end',null,'has_comparison',false,
      'account_id',p_account_id,'account_name',v_acc_name,
      'warnings', json_build_array(
        'Saldo inicial = todos os movimentos anteriores à data de início. Saldo final = saldo inicial + entradas − saídas.',
        'Os lançamentos estornados e os respetivos estornos aparecem ambos: anulam-se no saldo mas ficam visíveis para auditoria.')),
    'account', json_build_object('id',p_account_id,'name',v_acc_name),
    'opening', v_opening,
    'rows',    v_rows,
    'inflow',  v_in,
    'outflow', v_out,
    'closing', v_opening + v_in - v_out
  );
end; $$;

revoke execute on function report_account_ledger(uuid, date, date, uuid) from public, anon;
grant execute on function report_account_ledger(uuid, date, date, uuid) to authenticated;
