-- ENDURECIMENTO DE PRIVILÉGIOS — remover a superfície de ataque do papel `anon`
--
-- O papel `anon` é o que qualquer visitante do site usa (a chave pública está
-- no bundle JavaScript e é pública por desenho). No ZeroMaka a única coisa que
-- um visitante não autenticado precisa de fazer na base de dados é submeter o
-- formulário de contacto. Tudo o resto exige sessão.
--
-- ESTAVA CONCEDIDO A `anon`:
--   * ALL (incluindo TRUNCATE) em 12 tabelas do núcleo financeiro. O RLS
--     neutralizava a leitura/escrita, mas TRUNCATE ignora RLS por desenho, e
--     depender de o RLS estar sempre perfeito é uma camada única de defesa.
--   * EXECUTE em 20 funções — incluindo next_entry_number, que é
--     SECURITY DEFINER e NÃO verifica autenticação nem organização.
--     Confirmado por HTTP: um anónimo avançou a numeração de documentos de
--     uma organização, três vezes seguidas, à distância. Isso fura a sequência
--     legal de numeração de documentos (problema de conformidade, não só de
--     segurança).
--
-- CAUSA-RAIZ
-- `ALTER DEFAULT PRIVILEGES` no schema public concedia automaticamente ALL a
-- `anon` em CADA tabela/view nova e EXECUTE em CADA função nova. Foi assim que
-- a view obligation_status nasceu exposta (ver 20260810_0051) — e a próxima
-- nasceria também. Corrigir só os objetos existentes não chegava; era preciso
-- fechar a torneira. Alterar default privileges não afeta objetos existentes,
-- por isso essa parte não pode quebrar nada que hoje funcione.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- Única função de que o formulário público precisa.
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text) to anon;

-- `authenticated` escreve via RPC ou via RLS; nunca precisa de reestruturar
-- nem de esvaziar tabelas. TRUNCATE é especialmente perigoso por ignorar RLS.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.tablename);
  end loop;
end $$;

-- VERIFICADO DEPOIS DE APLICAR (por HTTP, com a chave pública real):
--   anon -> next_entry_number ......... 401
--   anon -> obligation_status ......... 401
--   anon -> accounts .................. 401
--   anon -> create_organization ....... 401
--   anon -> submit_contact_message .... 200 (formulário público intacto)
--   cliente autenticado ............... vê as suas 2 contas, 5 obrigações,
--                                       170 lançamentos, 19 contactos, e
--                                       apenas 1 organização.
-- As únicas 4 funções sem EXECUTE para `authenticated` são helpers internos
-- (_convert_entry_to_loan_obligation, _disburse_requisition_ledger) e funções
-- de trigger (audit_financial_settings, enforce_open_accounting_period), que
-- nunca são chamadas diretamente pela aplicação.
