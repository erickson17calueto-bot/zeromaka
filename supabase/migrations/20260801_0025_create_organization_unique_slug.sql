-- create_organization deduplicava zero vezes: passava o p_slug tal e qual e
-- rebentava com "duplicate key value violates unique constraint
-- organizations_slug_key" quando outra empresa já tinha o mesmo slug. Passa a
-- normalizar (minúsculas, remover acentos, colapsar caracteres estranhos em '-')
-- e a acrescentar '-2', '-3'... até o slug ser único. Retenta em caso de corrida
-- entre pedidos simultâneos até 100 vezes.
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org_id uuid;
  v_user_id uuid;
  v_base_slug text;
  v_candidate text;
  v_n int := 1;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Não autenticado'; end if;

  -- Normaliza o slug pedido: sem acentos, minúsculas, só a-z0-9 e traços.
  v_base_slug := lower(coalesce(nullif(btrim(p_slug), ''), p_name));
  v_base_slug := translate(v_base_slug,
    'áàâãäåéèêëíìîïóòôõöúùûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn');
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := btrim(v_base_slug, '-');
  if v_base_slug = '' then v_base_slug := 'org'; end if;

  v_candidate := v_base_slug;
  v_org_id := gen_random_uuid();

  -- Tenta inserir; se colidir com organizations_slug_key, acrescenta sufixo.
  loop
    begin
      insert into public.organizations (id, name, slug)
      values (v_org_id, p_name, v_candidate);
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
      if v_n > 100 then raise exception 'Não foi possível criar organização única'; end if;
      v_candidate := v_base_slug || '-' || v_n::text;
    end;
  end loop;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.companies (organization_id) values (v_org_id);

  update public.profiles set current_org_id = v_org_id where id = v_user_id;

  return v_org_id;
end;
$$;
