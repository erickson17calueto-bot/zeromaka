-- Fase 1 (requisições): dois novos estados para separar aprovar de
-- desembolsar — 'aguardando_desembolso' (aprovada, dinheiro ainda não
-- saiu) e 'desembolsada' (dinheiro já saiu). 'aprovado' continua a existir
-- tal como está, para requisições normais que aprovam+desembolsam no
-- mesmo passo (compatibilidade total com o fluxo atual).
--
-- Regra de enums do projeto: ALTER TYPE ... ADD VALUE não pode partilhar
-- transação com código que usa o valor novo — migração isolada.

alter type req_status add value if not exists 'aguardando_desembolso';
alter type req_status add value if not exists 'desembolsada';
