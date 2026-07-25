-- Zona de perigo: apaga os DADOS de uma organização para se recomeçar do zero.
--
-- Guardas (todas do lado do servidor, não confiar no frontend):
--   1. tem de estar autenticado;
--   2. tem de ser membro da organização E ter o papel 'owner';
--   3. tem de escrever o nome exato da organização como confirmação.
--
-- Mantém deliberadamente: a organização, os membros, a empresa, as categorias,
-- as definições financeiras e os audit_logs — o rasto de auditoria NUNCA é
-- apagado (regra da carta do projeto). A própria reposição fica registada.
create or replace function reset_organization_data(
  p_org_id uuid,
  p_confirmation text
) returns json language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_name text;
  v_counts json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select om.role into v_role
  from organization_members om
  where om.organization_id = p_org_id and om.user_id = v_uid;

  if v_role is null then raise exception 'Sem acesso a esta organização'; end if;
  if v_role <> 'owner' then
    raise exception 'Apenas o proprietário da organização pode repor os dados';
  end if;

  select o.name into v_name from organizations o where o.id = p_org_id;
  if v_name is null then raise exception 'Organização não encontrada'; end if;

  if lower(btrim(coalesce(p_confirmation,''))) <> lower(btrim(v_name)) then
    raise exception 'Confirmação inválida: escreve exatamente o nome da organização';
  end if;

  -- contagens antes de apagar (devolvidas ao utilizador e guardadas na auditoria)
  select json_build_object(
    'operation',   'reset_organization_data',
    'lancamentos', (select count(*) from journal_entries where organization_id = p_org_id),
    'faturas',     (select count(*) from financial_obligations where organization_id = p_org_id),
    'pagamentos',  (select count(*) from settlements where organization_id = p_org_id),
    'contas',      (select count(*) from accounts where organization_id = p_org_id),
    'contactos',   (select count(*) from contacts where organization_id = p_org_id),
    'reservas',    (select count(*) from financial_reserves where organization_id = p_org_id),
    'requisicoes', (select count(*) from requisitions where organization_id = p_org_id)
  ) into v_counts;

  -- ordem de dependências: filhos primeiro
  delete from reserve_movements       where organization_id = p_org_id;
  delete from settlement_allocations  where organization_id = p_org_id;
  delete from collection_interactions where organization_id = p_org_id;
  delete from financial_reserves      where organization_id = p_org_id;
  delete from settlements             where organization_id = p_org_id;
  delete from journal_lines           where organization_id = p_org_id;
  -- quebra as auto-referências de estorno antes de apagar os lançamentos
  update journal_entries set reverses_entry_id = null, reversed_by_entry_id = null
    where organization_id = p_org_id;
  delete from journal_entries         where organization_id = p_org_id;
  delete from transactions            where organization_id = p_org_id;
  delete from requisitions            where organization_id = p_org_id;
  delete from financial_obligations   where organization_id = p_org_id;
  delete from accounts                where organization_id = p_org_id;
  delete from contacts                where organization_id = p_org_id;
  delete from report_exports          where organization_id = p_org_id;
  delete from document_number_sequences where organization_id = p_org_id;
  delete from journal_entry_sequences   where organization_id = p_org_id;

  -- audit_logs.action só aceita INSERT/UPDATE/DELETE; o detalhe vai no payload
  insert into audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  values (p_org_id, v_uid, 'DELETE', 'organizations', p_org_id, v_counts);

  return json_build_object('ok', true, 'organization', v_name, 'apagado', v_counts);
end; $$;

revoke execute on function reset_organization_data(uuid, text) from public, anon;
grant execute on function reset_organization_data(uuid, text) to authenticated;
