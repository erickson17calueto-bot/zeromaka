# Barra visual — estrutura privada do ZeroMaka

Referências inspecionadas: `140098.png`, `140108 (1).png` e `140117.png`.
Render atual inspecionado: `http://localhost:3000/app/contas-a-pagar`.

## Mecanismos observáveis

1. **Navegação e casca compactas.** Em desktop, a barra lateral mostra no máximo seis destinos principais e um único acesso “Mais”, ocupa entre 208 e 224 px expandida e convive com um topo entre 52 e 60 px. O conteúdo começa com 28–32 px de margem em desktop e 16–20 px em ecrãs pequenos.

2. **Tema claro e escuro com a mesma leitura.** Títulos, explicações, montantes, ícones e estados têm contraste legível nos dois temas. O cartão do saldo mantém o fundo violeta escuro aprovado, mas o texto dentro dele não herda cores escuras quando o tema claro está ativo.

3. **Escala tipográfica contida.** Títulos de página ficam entre 24 e 30 px; títulos de secção entre 15 e 17 px; texto corrente entre 12 e 14 px. Valores financeiros principais podem chegar a 28–34 px, mas os cartões secundários ficam entre 20 e 26 px. Explicações usam uma ou duas frases curtas e, sempre que possível, ocupam no máximo três linhas.

4. **Cartões consistentes.** Cartões usam uma borda de 1 px, raio entre 14 e 16 px, preenchimento de 18–20 px e diferença discreta em relação ao fundo. Cada cartão tem no máximo um ícone enquadrado; a cor do ícone acompanha o significado financeiro. O hover desloca no máximo 1 px.

5. **Fundo com presença discreta.** A área privada usa no máximo dois brilhos radiais de baixa opacidade e uma trama quase impercetível. O fundo não pode reduzir o contraste, atravessar o texto como ilustração ou competir com os dados. No tema claro, os brilhos passam para tons quentes e lavanda muito claros.

6. **Cor com função.** O laranja do ZeroMaka aparece na ação primária, no item ativo e em ligações. Verde, vermelho e amarelo ficam reservados a entradas, saídas e atenção. Fundos tingidos aparecem apenas nos ícones, estados e no cartão principal de saldo.

7. **Primeiro ecrã útil e contexto sem duplicação.** A 1440 × 900, o utilizador vê o título, a ação principal, os indicadores e o início da área seguinte. Organização, página atual e ações globais aparecem uma única vez; a navegação lateral não tem scroll próprio na vista padrão.

## Limites funcionais

- Nenhuma rota financeira será removida; rotas secundárias serão agrupadas.
- A visibilidade por papel e os badges operacionais serão mantidos.
- Cálculos, permissões, RLS, formulários e ações de auditoria não serão alterados por esta remodelação.
- O modo móvel manterá até cinco destinos persistentes e um acesso “Mais”.
