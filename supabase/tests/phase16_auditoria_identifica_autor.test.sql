-- Fase 7: get_organization_audit passa a SECURITY DEFINER. Antes desta
-- migração, o JOIN interno a profiles ficava sujeito à policy dessa
-- tabela (auth.uid() = id) e qualquer autor que não fosse o próprio
-- chamador aparecia como "Utilizador" genérico.

insert into profiles (id, full_name) values ('f2000000-0000-0000-0000-000000000001', 'Owner Teste F')
on conflict (id) do update set full_name = excluded.full_name;

create temp table _tr(id serial, name text, passed bool, detail text) on commit drop;

do $$
declare
  orgF uuid := 'f1000000-0000-0000-0000-000000000001';
  ownerF uuid := 'f2000000-0000-0000-0000-000000000001';
  reqF uuid := 'f2000000-0000-0000-0000-000000000002';
  v json;
  v_owner_name text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', reqF, 'role','authenticated')::text, true);
  v := get_organization_audit(orgF, 50);

  select (elem->>'user_name') into v_owner_name
  from json_array_elements(v) elem
  where (elem->>'user_id')::uuid = ownerF
  limit 1;

  insert into _tr(name,passed,detail) values(
    'get_organization_audit identifica autor que nao e o proprio chamador',
    v_owner_name is not null and v_owner_name <> 'Utilizador',
    'user_name devolvido = ' || coalesce(v_owner_name, 'NULL')
  );
end $$;

select id, name, passed, detail from _tr order by id;
