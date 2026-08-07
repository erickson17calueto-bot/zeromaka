-- Defesa em profundidade para financial_categories, depois de uma
-- verificação adversarial encontrar dois desvios reais entre a regra de
-- negócio (só existente dentro de create_financial_category) e o que a base
-- de dados por si só permite:
--
-- 1. Uma policy RLS pré-existente ("Admins can delete categories") + GRANT
--    DELETE em authenticated permitem apagar uma categoria nunca usada
--    diretamente via supabase-js, contornando a app (que só oferece
--    arquivar/reativar — nunca apagar, conforme pedido). O FK RESTRICT já
--    impede apagar uma categoria em uso; isto fecha o caso de uma categoria
--    livre.
-- 2. As policies de insert/update só verificam pertença à organização, não
--    a consistência de tipo/hierarquia (subcategoria do mesmo tipo da mãe,
--    mãe sem mãe própria). Uma escrita direta à tabela, fora da RPC, podia
--    criar um estado inconsistente. Um trigger fecha esse caminho
--    independentemente de vir da RPC ou de uma chamada direta.

revoke delete on table public.financial_categories from authenticated;

create or replace function public.validate_financial_category() returns trigger
language plpgsql
as $$
declare v_parent record;
begin
  if new.parent_id is not null then
    select * into v_parent from financial_categories where id = new.parent_id;
    if v_parent.id is null or v_parent.organization_id <> new.organization_id then
      raise exception 'Categoria principal não encontrada nesta organização';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'Uma subcategoria não pode ter outra subcategoria como categoria principal';
    end if;
    if v_parent.category_type <> new.category_type then
      raise exception 'A subcategoria tem de ser do mesmo tipo (entrada/saída) da categoria principal';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_validate_financial_category on public.financial_categories;
create trigger trg_validate_financial_category
  before insert or update of parent_id, category_type, organization_id on public.financial_categories
  for each row execute function public.validate_financial_category();
