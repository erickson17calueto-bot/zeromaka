-- Fase 4 (correção) — audit_financial_change() usa NEW.id, mas
-- organization_financial_settings tem PK organization_id (sem coluna id).
-- Trigger dedicado que usa organization_id como record_id.

drop trigger if exists trg_finsettings_audit on organization_financial_settings;

create or replace function audit_financial_settings()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_logs (organization_id, user_id, table_name, record_id, action, new_data)
    values (NEW.organization_id, auth.uid(), TG_TABLE_NAME, NEW.organization_id, 'INSERT', to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_logs (organization_id, user_id, table_name, record_id, action, old_data, new_data)
    values (NEW.organization_id, auth.uid(), TG_TABLE_NAME, NEW.organization_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_logs (organization_id, user_id, table_name, record_id, action, old_data)
    values (OLD.organization_id, auth.uid(), TG_TABLE_NAME, OLD.organization_id, 'DELETE', to_jsonb(OLD));
    return OLD;
  end if;
  return null;
end; $$;

create trigger trg_finsettings_audit after insert or update or delete on organization_financial_settings
  for each row execute function audit_financial_settings();

-- função de trigger não deve ser invocável como RPC
revoke execute on function audit_financial_settings() from public, anon, authenticated;
