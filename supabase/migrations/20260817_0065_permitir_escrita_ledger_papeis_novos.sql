-- Achado ao testar: post_settlement/grant_employee_loan foram abertos ao
-- cobrador/pagador/rh, mas essas RPCs chamam por dentro next_entry_number,
-- next_document_number, post_income e post_expense — cada uma com a SUA
-- PRÓPRIA verificação interna (user_writable_org_ids() só), independente da
-- verificação que a função de fora já tinha feito. Resultado ao vivo: um
-- cobrador autorizado por post_settlement era bloqueado dois níveis abaixo
-- por next_entry_number, com uma mensagem de erro diferente ("Sem permissão
-- para esta organização" em vez de qualquer coisa vinda de post_settlement).
--
-- Em vez de espalhar "OR user_can_write(...)" em 4 sítios com a mesma
-- intenção, um único ponto de decisão: "pode escrever no razão, por
-- qualquer via legítima". Deliberadamente NÃO inclui 'requisitions' — um
-- requisitante ou aprovador continuam sem poder tocar no razão diretamente,
-- só através das RPCs de requisição que já fazem a sua própria validação
-- precisa (approve_requisition, disburse_requisition).
create or replace function public.user_can_write_ledger(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_org_id in (select public.user_writable_org_ids())
    or public.user_can_write(p_org_id, 'ledger')
    or public.user_can_write(p_org_id, 'obligations_receivable')
    or public.user_can_write(p_org_id, 'obligations_payable')
    or public.user_can_write(p_org_id, 'loans');
$$;
revoke all on function public.user_can_write_ledger(uuid) from public, anon;
grant execute on function public.user_can_write_ledger(uuid) to authenticated;

create or replace function public.next_document_number(p_org_id uuid, p_prefix text, p_year integer)
 returns text
 language plpgsql security definer set search_path to ''
as $function$
declare v_num int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.user_can_write_ledger(p_org_id) then
    raise exception 'Sem permissão para esta organização';
  end if;
  insert into public.document_number_sequences (organization_id, prefix, year, last_number)
  values (p_org_id, p_prefix, p_year, 1)
  on conflict (organization_id, prefix, year)
  do update set last_number = public.document_number_sequences.last_number + 1
  returning last_number into v_num;
  return p_prefix || '-' || p_year || '-' || lpad(v_num::text, 6, '0');
end; $function$;

create or replace function public.next_entry_number(p_org_id uuid, p_year integer)
 returns text
 language plpgsql security definer set search_path to ''
as $function$
DECLARE v_num int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.user_can_write_ledger(p_org_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização';
  END IF;
  INSERT INTO public.journal_entry_sequences (organization_id, year, last_number)
  VALUES (p_org_id, p_year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_number = public.journal_entry_sequences.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN 'MOV-' || p_year || '-' || lpad(v_num::text, 6, '0');
END; $function$;

-- NOTA: a versão de post_income/post_expense aplicada nesta migração ainda
-- usava user_can_write_ledger() no seu próprio corpo (a mesma permissão
-- alargada de next_entry_number). Foi corrigido na migração seguinte
-- (20260817_0066) depois de um teste ao vivo mostrar que isso deixava um
-- cobrador chamar post_expense DIRETAMENTE e fabricar uma despesa arbitrária
-- sem nenhuma obrigação real por trás. Ver esse ficheiro para a versão final.
