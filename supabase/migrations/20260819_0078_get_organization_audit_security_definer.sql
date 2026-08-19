-- Fase 7 do plano de evolução de permissões (auditoria 2026-08-19),
-- achado [Médio]: get_organization_audit() não era SECURITY DEFINER — o
-- JOIN com profiles ficava sujeito à policy dessa tabela (auth.uid() =
-- id, só o próprio perfil), por isso o nome de QUALQUER outra pessoa
-- aparecia sempre como "Utilizador" genérico no ecrã de auditoria. O
-- registo em si funcionava (quem fez o quê, quando, diff old/new), só
-- não identificava o autor — minava o propósito de um log de auditoria
-- multiutilizador.
--
-- A autorização da função já estava correta (exige user_org_ids() e
-- filtra por organization_id = p_org_id) — só faltava o SECURITY
-- DEFINER para o JOIN interno a profiles não ser bloqueado pela RLS
-- dessa tabela. Nenhuma outra lógica alterada.
create or replace function public.get_organization_audit(p_org_id uuid, p_limit integer DEFAULT 50)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_result json;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_org_ids()) then raise exception 'Sem acesso a esta organização'; end if;
  select coalesce(json_agg(row_to_json(a) order by a.created_at desc), '[]'::json) into v_result
  from (
    select al.id, al.created_at, al.action, al.table_name, al.record_id,
      al.old_data, al.new_data, al.user_id, coalesce(p.full_name, 'Utilizador') as user_name
    from audit_logs al left join profiles p on p.id = al.user_id
    where al.organization_id = p_org_id
    order by al.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) a;
  return v_result;
end;
$function$;
