-- Mensagens do formulário de contacto do site público.
--
-- O formulário é acessível sem sessão, por isso a inserção tem de ser feita por
-- uma função controlada em vez de um INSERT direto: assim a validação e o limite
-- de envios ficam do lado do servidor, onde não podem ser contornados.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company text,
  subject text not null,
  message text not null,
  -- Hash do IP, nunca o IP em claro: chega para limitar abusos sem guardar
  -- um dado pessoal que não precisamos de conhecer.
  ip_hash text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx on public.contact_messages (created_at desc);
create index if not exists contact_messages_ip_hash_idx on public.contact_messages (ip_hash, created_at desc);

alter table public.contact_messages enable row level security;

-- Sem políticas: nem anon nem authenticated conseguem ler ou escrever
-- diretamente. O único caminho é a função abaixo, que corre como owner.
revoke all on public.contact_messages from anon, authenticated;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_phone text default null,
  p_company text default null,
  p_ip_hash text default null
) returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
  v_id uuid;
begin
  -- Validação mínima do lado do servidor. O cliente também valida, mas o
  -- cliente pode ser contornado.
  if coalesce(btrim(p_name), '') = '' or length(btrim(p_name)) < 2 then
    raise exception 'Nome inválido' using errcode = '22023';
  end if;
  if coalesce(btrim(p_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  if coalesce(btrim(p_subject), '') = '' then
    raise exception 'Assunto obrigatório' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_message, ''))) < 10 then
    raise exception 'Mensagem demasiado curta' using errcode = '22023';
  end if;
  if length(p_message) > 5000 then
    raise exception 'Mensagem demasiado longa' using errcode = '22023';
  end if;

  -- Limite de envios: no máximo 5 mensagens por hora a partir da mesma origem.
  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.contact_messages
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';

    if v_recent >= 5 then
      raise exception 'Demasiados envios. Tenta novamente mais tarde.' using errcode = '54000';
    end if;
  end if;

  insert into public.contact_messages (name, email, phone, company, subject, message, ip_hash)
  values (btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''),
          nullif(btrim(p_company), ''), btrim(p_subject), btrim(p_message), p_ip_hash)
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text) to anon, authenticated;
