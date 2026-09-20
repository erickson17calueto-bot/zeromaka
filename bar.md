# Barra visual — estrutura privada do ZeroMaka

Referências inspecionadas: `140098.png`, `140108 (1).png` e `140117.png`.
Render atual inspecionado: `http://localhost:3000/app/contas-a-pagar`.

## Mecanismos observáveis

1. **Navegação persistente curta.** Em desktop, a barra lateral deve mostrar no máximo seis destinos principais e um único acesso “Mais”. Não deve haver listas longas, acordeões por categoria ou cartão de XP acima da navegação.

2. **Casca compacta.** A barra lateral deve ocupar entre 208 e 224 px expandida, e a barra superior entre 52 e 60 px de altura. O conteúdo deve começar com 28–32 px de margem em desktop e 16–20 px em ecrãs pequenos.

3. **Escala tipográfica contida.** Títulos de página entre 24 e 30 px; títulos de secção entre 14 e 17 px; texto corrente entre 12 e 14 px; etiquetas auxiliares entre 10 e 12 px. Valores financeiros principais podem chegar a 28–34 px, mas os valores de cartões secundários não devem competir com o título da página.

4. **Poucas superfícies, sem cartões dentro de cartões.** Cada primeiro ecrã deve ter no máximo três superfícies principais antes da lista ou tabela. Cartões usam uma borda de 1 px de baixo contraste, raio entre 12 e 16 px e fundo com diferença discreta em relação à página.

5. **Espaçamento regular.** Intervalos entre blocos principais de 24–32 px, entre cartões de 10–14 px e preenchimento interno de 16–20 px. Nenhum texto ou ação deve ficar a menos de 12 px da borda de uma superfície.

6. **Cor com função.** O laranja do ZeroMaka aparece na ação primária, no item ativo e em estados de atenção. Não deve preencher vários cartões ao mesmo tempo. Verde, vermelho e amarelo ficam reservados a estados financeiros reais.

7. **Contexto sem duplicação.** O topo mostra organização, página atual e ações globais uma única vez. A navegação específica da área deve aparecer como separadores horizontais ou num menu “Mais”, sem repetir o mesmo destino na barra lateral, no topo e no corpo da página.

8. **Primeiro ecrã útil.** A 1440 × 900, o utilizador deve ver o título, a ação principal, os indicadores e o início da lista/tabela sem precisar de percorrer a barra lateral. A navegação lateral não pode ter scroll próprio na vista padrão.

## Limites funcionais

- Nenhuma rota financeira será removida; rotas secundárias serão agrupadas.
- A visibilidade por papel e os badges operacionais serão mantidos.
- Cálculos, permissões, RLS, formulários e ações de auditoria não serão alterados por esta remodelação.
- O modo móvel manterá até cinco destinos persistentes e um acesso “Mais”.
