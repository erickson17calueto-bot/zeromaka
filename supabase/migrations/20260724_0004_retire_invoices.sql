-- Fase 3f — Aposentar a tabela invoices (substituída por financial_obligations)
-- A tabela invoices nunca teve dados neste projeto (0 linhas). O modelo unificado
-- de obrigações (Fase 3) substitui-a por completo. Guarda de segurança: se existirem
-- linhas, aborta em vez de as apagar silenciosamente.
do $$
declare v_count int;
begin
  select count(*) into v_count from invoices;
  if v_count > 0 then
    raise exception 'invoices tem % linha(s) — migrar para financial_obligations antes de remover', v_count;
  end if;
end $$;

drop function if exists mark_invoice_paid(uuid, uuid, uuid);
drop table if exists invoices;
drop type if exists invoice_status;
drop type if exists invoice_type;
