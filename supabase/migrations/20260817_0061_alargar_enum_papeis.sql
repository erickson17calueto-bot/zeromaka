-- Fase de permissões alargadas: 9 papéis novos além dos 5 existentes
-- (owner/admin/member/finance/viewer). ADD VALUE tem de estar numa migração
-- própria, separada de qualquer coisa que USE os valores novos na mesma
-- transação — por isso este ficheiro só alarga o tipo, nada mais.
alter type member_role add value if not exists 'requisitante';
alter type member_role add value if not exists 'cobrador';
alter type member_role add value if not exists 'pagador';
alter type member_role add value if not exists 'contabilista';
alter type member_role add value if not exists 'caixa';
alter type member_role add value if not exists 'aprovador';
alter type member_role add value if not exists 'rh';
alter type member_role add value if not exists 'auditor';
alter type member_role add value if not exists 'convidado_temp';
