-- Fase 3c (reforço) — Bloquear privilégios por omissão em anon/authenticated/public.
-- Os privilégios default do Postgres concederam INSERT/UPDATE/DELETE a anon e
-- authenticated nas tabelas novas. A RLS já mitiga (sem políticas de escrita, e
-- anon sem organização), mas por defesa em profundidade revogamos tudo e voltamos
-- a conceder apenas o mínimo. Escrita continua só via funções SECURITY DEFINER.

revoke all on financial_obligations from anon, authenticated, public;
revoke all on settlements from anon, authenticated, public;
revoke all on settlement_allocations from anon, authenticated, public;
revoke all on collection_interactions from anon, authenticated, public;
revoke all on obligation_status from anon, authenticated, public;
revoke all on document_number_sequences from anon, authenticated, public;

-- Leitura por membros da org (RLS filtra as linhas)
grant select on financial_obligations to authenticated;
grant select on settlements to authenticated;
grant select on settlement_allocations to authenticated;
grant select on obligation_status to authenticated;
-- Interações: leitura + inserção direta (log de cobrança), RLS valida
grant select, insert on collection_interactions to authenticated;
