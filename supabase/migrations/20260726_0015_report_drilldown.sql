-- Drill-down dos relatórios: clicar num número e ver de onde ele vem.
--
-- Duas partes:
--   1. cada linha dos relatórios passa a ter uma CHAVE estável ('key'), para a
--      UI poder identificar sem ambiguidade a linha clicada;
--   2. report_drilldown devolve os documentos que compõem essa linha, mais o
--      total — para o utilizador confirmar que a soma bate certo com o valor
--      apresentado no relatório.
--
-- As chaves ficam definidas em report_income_cash ('income:<categoria>' /
-- 'expense:<categoria>') e report_aging ('receivable:<escalao>' /
-- 'payable:<escalao>'), nas migrações que as recriam.
--
-- SECURITY INVOKER: respeita a RLS, tal como os restantes relatórios.
create or replace function report_drilldown(
  p_org_id uuid,
  p_report text,
  p_key    text,
  p_start  date,
  p_end    date
) returns json language plpgsql security invoker set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_kind  text := split_part(p_key, ':', 1);
  v_rest  text := substr(p_key, length(split_part(p_key, ':', 1)) + 2);
  v_ord   int;
  v_lo    int;
  v_hi    int;
  v_rows  json;
  v_total numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  if p_start > p_end then raise exception 'Datas invertidas'; end if;

  if p_report = 'income_statement' and v_kind in ('income','expense') then
    -- v_rest = nome da categoria. O valor mostrado é líquido de imposto nas
    -- vendas, exatamente como na linha do relatório.
    with e as (
      select je.transaction_date as data,
             coalesce(je.entry_number, '—') as numero,
             coalesce(nullif(je.description,''), 'Sem descrição') as descricao,
             coalesce(c.name, '—') as contacto,
             case when je.entry_type = 'income'::journal_entry_type
                    and coalesce((je.metadata->>'is_sale')::boolean,false)
                  then jl.amount - coalesce((je.metadata->>'tax_amount')::numeric,0)
                  else jl.amount end as valor,
             coalesce((je.metadata->>'tax_amount')::numeric,0) as imposto
      from journal_entries je
      join journal_lines jl on jl.journal_entry_id = je.id
      left join financial_categories fc on fc.id = je.category_id
      left join contacts c on c.id = je.contact_id
      where je.organization_id = p_org_id
        and je.status = 'posted'
        -- entry_type é do tipo enum journal_entry_type: cast explícito
        and je.entry_type = v_kind::journal_entry_type
        and coalesce(je.metadata->>'type','') not in ('capital_in','capital_out')
        and coalesce(fc.name, je.metadata->>'category', 'Sem categoria') = v_rest
        and je.transaction_date between p_start and p_end
    )
    select coalesce(json_agg(json_build_object(
             'data',data,'numero',numero,'descricao',descricao,
             'contacto',contacto,'valor',valor,'imposto',imposto) order by data desc), '[]'::json),
           coalesce(sum(valor),0)
      into v_rows, v_total
    from e;

  elsif p_report = 'aging' and v_kind in ('receivable','payable') then
    -- v_rest = número do escalão; os limites têm de coincidir com report_aging
    v_ord := nullif(v_rest,'')::int;
    select lo, hi into v_lo, v_hi from (values
      (1,-100000,0),(2,1,30),(3,31,60),(4,61,90),(5,91,100000)
    ) as b(ord,lo,hi) where b.ord = v_ord;
    if v_lo is null then raise exception 'Escalão desconhecido'; end if;

    with o as (
      select os.due_date as data,
             os.internal_number as numero,
             coalesce(nullif(os.description,''), 'Sem descrição') as descricao,
             coalesce(c.name,'—') as contacto,
             os.outstanding_amount as valor,
             (p_end - os.due_date) as dias
      from obligation_status os
      left join contacts c on c.id = os.contact_id
      where os.organization_id = p_org_id
        and os.lifecycle_status = 'open'
        and os.outstanding_amount > 0
        and os.issue_date <= p_end
        and os.direction = v_kind::obligation_direction
        and (p_end - os.due_date) between v_lo and v_hi
    )
    select coalesce(json_agg(json_build_object(
             'data',data,'numero',numero,'descricao',descricao,
             'contacto',contacto,'valor',valor,'dias',dias) order by data), '[]'::json),
           coalesce(sum(valor),0)
      into v_rows, v_total
    from o;

  else
    raise exception 'Detalhe indisponível para esta linha';
  end if;

  return json_build_object('rows', v_rows, 'total', v_total, 'report', p_report, 'key', p_key);
end; $$;

revoke execute on function report_drilldown(uuid, text, text, date, date) from public, anon;
grant execute on function report_drilldown(uuid, text, text, date, date) to authenticated;
