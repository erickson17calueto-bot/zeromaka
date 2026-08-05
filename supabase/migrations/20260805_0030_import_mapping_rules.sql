-- Fase 2 do overhaul de importação — regras de correspondência aprendidas.
--
-- A sugestão automática (suggest-contact, suggest-category) acerta muito, mas
-- nunca vai saber que "PGT FORN XPTO" desta organização é sempre o contacto
-- "XPTO Comércio, Lda" — isso só o utilizador sabe. Em vez de corrigir a
-- mesma linha em todas as importações futuras, o utilizador pode "lembrar" a
-- correspondência uma vez; da próxima vez que o mesmo texto aparecer (mesma
-- organização, mesmo destino de importação, mesmo campo), a regra aprendida
-- aplica-se automaticamente — antes de qualquer sugestão heurística.
--
-- Nunca é silenciosa na criação: só existe quando o utilizador carrega
-- explicitamente em "lembrar" depois de escolher o contacto/categoria certos.

create table if not exists import_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  target_type text not null check (target_type in ('transaction', 'receivable', 'payable')),
  field text not null check (field in ('contact_id', 'category_id')),
  match_value text not null,
  value_id uuid not null,
  hit_count integer not null default 1 check (hit_count > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (organization_id, target_type, field, match_value)
);

create index if not exists idx_import_mapping_rules_lookup
  on import_mapping_rules(organization_id, target_type, field, match_value);

alter table import_mapping_rules enable row level security;

revoke all on table import_mapping_rules from anon;
grant select, insert, update, delete on table import_mapping_rules to authenticated;

drop policy if exists import_mapping_rules_select on import_mapping_rules;
create policy import_mapping_rules_select on import_mapping_rules for select to authenticated
  using (organization_id in (select user_writable_org_ids()));

drop policy if exists import_mapping_rules_insert on import_mapping_rules;
create policy import_mapping_rules_insert on import_mapping_rules for insert to authenticated
  with check (organization_id in (select user_writable_org_ids()) and created_by = auth.uid());

drop policy if exists import_mapping_rules_update on import_mapping_rules;
create policy import_mapping_rules_update on import_mapping_rules for update to authenticated
  using (organization_id in (select user_writable_org_ids()))
  with check (organization_id in (select user_writable_org_ids()));

drop policy if exists import_mapping_rules_delete on import_mapping_rules;
create policy import_mapping_rules_delete on import_mapping_rules for delete to authenticated
  using (organization_id in (select user_writable_org_ids()));

-- Grava (ou reforça) uma regra aprendida. SECURITY DEFINER só para poder
-- fazer o upsert atómico com ON CONFLICT sem expor a tabela a escrita direta
-- de hit_count/last_used_at por quem não devia (a policy de update já bastava
-- para isso, mas manter a contagem coerente é mais simples numa função).
create or replace function public.remember_import_mapping(
  p_org_id uuid, p_target_type text, p_field text, p_match_value text, p_value_id uuid
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_org_id not in (select user_writable_org_ids()) then raise exception 'Sem permissão nesta organização'; end if;
  if p_target_type not in ('transaction', 'receivable', 'payable') then raise exception 'Destino inválido'; end if;
  if p_field not in ('contact_id', 'category_id') then raise exception 'Campo inválido'; end if;
  if p_match_value is null or length(btrim(p_match_value)) = 0 then raise exception 'Texto da regra vazio'; end if;

  insert into import_mapping_rules (organization_id, target_type, field, match_value, value_id, created_by)
  values (p_org_id, p_target_type, p_field, btrim(p_match_value), p_value_id, v_uid)
  on conflict (organization_id, target_type, field, match_value)
  do update set value_id = excluded.value_id, hit_count = import_mapping_rules.hit_count + 1, last_used_at = now()
  returning id into v_id;

  return json_build_object('id', v_id);
end; $$;

revoke all on function public.remember_import_mapping(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.remember_import_mapping(uuid, text, text, text, uuid) to authenticated;
