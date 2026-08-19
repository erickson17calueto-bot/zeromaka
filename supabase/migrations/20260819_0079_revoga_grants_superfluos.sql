-- Fase 10 (limpeza) do plano de evolução de permissões (auditoria
-- 2026-08-19), achado [Baixo]: organization_invites, role_resource_
-- permissions e audit_logs tinham INSERT/UPDATE/DELETE/TRUNCATE
-- concedidos a `authenticated` sem nenhuma policy de escrita a
-- acompanhar — as três só têm policy de SELECT. RLS já bloqueava
-- INSERT/UPDATE/DELETE (nega por omissão quando não há policy que
-- cubra o comando), mas TRUNCATE não é coberto por RLS nenhum — era uma
-- via real de qualquer utilizador autenticado apagar as três tabelas
-- inteiras. Revogado também INSERT/UPDATE/DELETE, não só TRUNCATE:
-- defesa em profundidade — um grant momo sem policy é uma armadilha à
-- espera de alguém adicionar uma policy permissiva por engano no
-- futuro, mesmo padrão já corrigido antes para financial_categories e
-- para os alvos do achado equivalente em 20260810_0053/0056.
--
-- Não renomeados os ficheiros de migration 20260817_0061..0071 (colidem
-- em número de sequência com 20260816_0061_arquivar_organizacao.sql,
-- cosmético) — decisão revista: renomear migrations já aplicadas
-- arrisca dessincronizar o histórico de migrations do Supabase (tabela
-- de tracking remota fica associada ao nome antigo do ficheiro); o
-- ganho é só estético, o risco é real. Deixado como está.

revoke insert, update, delete, truncate on public.organization_invites from authenticated;
revoke insert, update, delete, truncate on public.role_resource_permissions from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
