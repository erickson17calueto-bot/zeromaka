# ZeroMaka — Gestão financeira para negócios em Angola

**Sem maka, só lucro.** Aplicação web de gestão financeira em português (Kwanzas), pensada para a realidade angolana.

## Módulos

**Finanças**
- **Dashboard** — saldo consolidado, receitas/despesas do mês, **imposto a entregar ao Estado**, **líquido real** (caixa − imposto), Ativo/Passivo/Património, alertas de liquidez e vencimentos.
- **Contas** — bancos (BAI, BFA, BIC, BCI, BPC, Standard Bank, Sol, Keve, Atlântico, Económico…), carteiras móveis e caixa físico. Transferências internas (não contam como receita/despesa).
- **Transações** — lançamentos de entrada/saída, com opção "venda tributável" que calcula o imposto automaticamente.
- **Faturas** — contas a receber e a pagar em Kanban (pendente/vencida/paga), imposto nas vendas, marcação de pago (cria a transação e atualiza o saldo).

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

## Configuração

### Pré-requisitos
- Node.js 18+
- Projeto Supabase (gratuito em [supabase.com](https://supabase.com))

### Instalação

```bash
npm install
cp .env.example .env.local
```

Preenche `.env.local` com os valores do teu projeto Supabase (Dashboard → Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

> **Nunca** colocar a chave `service_role` no `.env.local` do frontend.

### Base de dados

As migrações criam automaticamente todas as tabelas necessárias no Supabase:

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Perfis de utilizador (criados automaticamente no registo) |
| `organizations` | Organizações/empresas |
| `organization_members` | Membros e papéis (owner, admin, finance, viewer) |
| `companies` | Dados fiscais da empresa (NIF, regime, morada) |
| `accounts` | Contas financeiras (banco, mobile, caixa) |
| `contacts` | Clientes, fornecedores e sócios |
| `transactions` | Lançamentos financeiros |
| `invoices` | Faturas a receber e a pagar |
| `requisitions` | Requisições de fundos |
| `audit_logs` | Registo de auditoria (automático via triggers) |

Row Level Security (RLS) está activo em todas as tabelas:
- Utilizadores só veem organizações das quais são membros.
- Dados empresariais isolados por `organization_id`.
- `viewer` tem acesso apenas de leitura.
- `finance`, `admin` e `owner` podem criar, editar e apagar dados.
- Apenas `owner` e `admin` podem gerir membros.

### Desenvolvimento

```bash
npm run dev
# abrir http://localhost:3000
```

### Produção

```bash
npm run build
npm start
```

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth + RLS) · lucide-react

---
Feito para a BLUEAXIS TRADING, LDA · Luanda, Angola.
