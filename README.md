# ZeroMaka — Gestão financeira para negócios em Angola

**Sem maka, só lucro.** Aplicação web de gestão financeira em português (Kwanzas), pensada para a realidade angolana.

## Módulos

**Finanças**
- **Dashboard** — saldo consolidado, receitas/despesas do mês, **imposto a entregar ao Estado**, **líquido real** (caixa − imposto), Ativo/Passivo/Património, alertas de liquidez e vencimentos.
- **Contas** — bancos (BAI, BFA, BIC, BCI, BPC, Standard Bank, Sol, Keve, Atlântico, Económico…), carteiras móveis e caixa físico. Transferências internas (não contam como receita/despesa).
- **Transações** — lançamentos de entrada/saída, com opção "venda tributável" que calcula o imposto automaticamente.
- **Faturas** — contas a receber e a pagar em Kanban (pendente/vencida/paga), imposto nas vendas, lembrete de cobrança por **WhatsApp** e marcação de pago (cria a transação e atualiza o saldo).

**Operações**
- **Requisições de fundos** — para compras sem fatura, com requisitante + responsável + fluxo de aprovação. Ao aprovar, gera a despesa automaticamente.
- **Capital dos sócios** — aportes e retiradas (suprimentos), saldo por sócio, validação de retiradas. Tratado como passivo, fora do resultado.
- **Contactos** — clientes, fornecedores e sócios.

**Análise**
- **Relatórios** — DRE, Fluxo de Caixa (DFC), Apuramento de Impostos e Ativo/Passivo, com alternância mês/acumulado.
- **Conquistas & Ranking** — gamificação (XP, níveis, streak, badges).

**Configuração**
- **Empresa** — nome, NIF, logótipo e **regime tributário** (Geral 14% · Simplificado 7% · Exclusão 1% Imposto de Selo).
- **Perfil** — dados pessoais, telefone com máscara +244, plano.

## Impostos (Angola)
O imposto é calculado **apenas sobre vendas**, nunca sobre outras receitas. A taxa vem do regime da empresa e o valor é separado como "dinheiro do Estado" — não entra como lucro na DRE.

## Como correr

```bash
npm install
npm run dev
# abrir http://localhost:3000 e entrar com qualquer e-mail (demo)
```

Os dados de demonstração ficam no `localStorage` do navegador (nada é enviado para servidores).

## Publicar grátis (Vercel)
```bash
npm i -g vercel
vercel
```

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS · lucide-react · estado em React Context + localStorage.

## Próximas fases
- Backend real (ex.: Supabase, plano gratuito) — o `store` já está desenhado para trocar o Context por API sem mexer nas páginas.
- Exportar relatórios (PDF/Excel) para o contabilista.
- Módulo de linguagem natural ("quanto gastei em transporte este mês?").
- Landing page de captação.

---
Feito para a BLUEAXIS TRADING, LDA · Luanda, Angola.
