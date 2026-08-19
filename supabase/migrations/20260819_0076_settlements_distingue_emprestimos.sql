-- Fase 5 do plano de evolução de permissões (auditoria 2026-08-19),
-- achado [Alto]: as políticas de SELECT de settlements/settlement_
-- allocations só olhavam para settlements.direction (incoming/outgoing) +
-- o recurso obligations_receivable/obligations_payable — nunca para o
-- document_kind da OBRIGAÇÃO associada, ao contrário de
-- financial_obligations (essa já distinguia corretamente, é o padrão de
-- referência usado aqui). Como devolução de empréstimo usa a mesma
-- direção 'incoming' que uma cobrança normal de cliente, um cobrador (tem
-- permissão em 'obligations_receivable' mas não em 'loans') conseguia ler
-- montante, funcionário, data e referência de liquidações de empréstimo —
-- só não via a obrigação em si (essa já estava corretamente escondida).
--
-- Corrigido por composição em vez de duplicar a lógica de document_kind:
-- a nova política de settlement_allocations só mostra uma linha se a
-- obrigação ligada (financial_obligations.id = obligation_id) for visível
-- ao próprio chamador — reaproveita a política JÁ correta de
-- financial_obligations via subquery (RLS de uma tabela aplica-se
-- normalmente dentro do USING de outra), em vez de repetir a mesma
-- condição em dois sítios que podiam divergir no futuro.
--
-- settlements (o cabeçalho do pagamento) fica visível se PELO MENOS UMA
-- das suas alocações for visível — não todas. Um settlement pode em
-- teoria cobrir várias obrigações de tipos diferentes na mesma chamada a
-- post_settlement (o RPC não o impede, só exige a permissão certa por
-- alocação); esconder o cabeçalho inteiro só porque uma das linhas é de
-- empréstimo esconderia também as linhas legítimas que o cobrador tem
-- direito de ver. O detalhe sensível (qual obrigação, que tipo) continua
-- só na linha de settlement_allocations, essa sim filtrada uma a uma.

drop policy if exists "sel_settlements" on public.settlements;
create policy "sel_settlements" on public.settlements for select
using (
  organization_id in (select user_org_ids())
  and exists (
    select 1 from settlement_allocations sa
    join financial_obligations fo on fo.id = sa.obligation_id
    where sa.settlement_id = settlements.id
  )
);

drop policy if exists "sel_allocations" on public.settlement_allocations;
create policy "sel_allocations" on public.settlement_allocations for select
using (
  organization_id in (select user_org_ids())
  and exists (select 1 from financial_obligations fo where fo.id = settlement_allocations.obligation_id)
);
