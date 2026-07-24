-- Fase 3c — RLS + exposição Data API + GRANTs
-- obligations/settlements/allocations: SELECT por membros da org; escritas só via
-- funções SECURITY DEFINER validadas (sem políticas de INSERT/UPDATE/DELETE = escrita
-- direta pela API bloqueada). collection_interactions permite INSERT direto (log).

-- SELECT (membros da organização)
create policy sel_obligations on financial_obligations
  for select using (organization_id in (select user_org_ids()));
create policy sel_settlements on settlements
  for select using (organization_id in (select user_org_ids()));
create policy sel_allocations on settlement_allocations
  for select using (organization_id in (select user_org_ids()));
create policy sel_interactions on collection_interactions
  for select using (organization_id in (select user_org_ids()));

-- collection_interactions: INSERT direto por papéis com escrita
alter table collection_interactions alter column performed_by set default auth.uid();
create policy ins_interactions on collection_interactions
  for insert with check (organization_id in (select user_writable_org_ids()));

-- GRANTs explícitos (Data API não expõe tabelas novas automaticamente)
grant select on financial_obligations to authenticated;
grant select on settlements to authenticated;
grant select on settlement_allocations to authenticated;
grant select, insert on collection_interactions to authenticated;
grant select on obligation_status to authenticated;

grant execute on function create_financial_obligation(uuid, obligation_direction, uuid, date, numeric, obligation_document_kind, text, date, text, text, text, uuid) to authenticated;
grant execute on function post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid) to authenticated;
grant execute on function reverse_settlement(uuid, text) to authenticated;
grant execute on function cancel_obligation(uuid, text) to authenticated;
grant execute on function update_obligation(uuid, uuid, text, text, numeric, date, date, uuid, text) to authenticated;

-- Least privilege: só authenticated executa (revogar anon/public dos SECURITY DEFINER)
revoke execute on function create_financial_obligation(uuid, obligation_direction, uuid, date, numeric, obligation_document_kind, text, date, text, text, text, uuid) from public, anon;
revoke execute on function post_settlement(uuid, settlement_direction, uuid, uuid, jsonb, date, text, text, text, uuid) from public, anon;
revoke execute on function reverse_settlement(uuid, text) from public, anon;
revoke execute on function cancel_obligation(uuid, text) from public, anon;
revoke execute on function update_obligation(uuid, uuid, text, text, numeric, date, date, uuid, text) from public, anon;
revoke execute on function next_document_number(uuid, text, integer) from public, anon;
