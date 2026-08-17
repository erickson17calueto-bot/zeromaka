"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, daysUntil, Obligation } from "@/lib/data";
import {
  Landmark, Smartphone, Banknote, TrendingUp, TrendingDown, AlertTriangle, X, ArrowRight,
  BellRing, Receipt, Scale, ArrowDownLeft, ArrowUpRight, HandCoins, Wallet, PiggyBank, CalendarClock,
} from "lucide-react";
import TrueAvailableBlock from "@/components/TrueAvailableBlock";
import StatCard, { SectionHead } from "@/components/StatCard";
import GettingStarted from "@/components/GettingStarted";

const ACC_STYLE = {
  bank: { icon: Landmark, tint: "text-maka-400", chip: "bg-maka-500/10", label: "Conta bancária" },
  mobile_money: { icon: Smartphone, tint: "text-emerald-400", chip: "bg-emerald-500/10", label: "Carteira móvel" },
  cash: { icon: Banknote, tint: "text-yellow-400", chip: "bg-yellow-500/10", label: "Caixa físico" }
} as const;

// Usa .pill (medido no Cota: 12px, cantos redondos, ponto de estado antes
// do texto). Passa de 10px/700 com borda para 12px/500 sem borda: a 10px o
// texto era quase ilegível, e a borda a somar ao fundo tingido fazia três
// sinais visuais para dizer uma coisa só.
function DirTag({ direction }: { direction: "receivable" | "payable" }) {
  const recv = direction === "receivable";
  return (
    <span className={`pill ${recv ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
      {recv ? "A receber · cliente" : "A pagar · fornecedor"}
    </span>
  );
}

export default function Dashboard() {
  const { accounts, transactions, obligations, settlements, contacts, profile } = useStore();
  const [showAlert, setShowAlert] = useState(false);

  const contactName = (id: string) => contacts.find(c => c.id === id)?.name ?? "—";
  const open = useMemo(() => obligations.filter(o => o.lifecycleStatus === "open" && o.outstandingAmount > 0), [obligations]);
  const isOverdue = (o: Obligation) => o.financialStatus === "overdue" || o.financialStatus === "partial_overdue";

  const dueSoon = useMemo(() => open.filter(o => { const d = daysUntil(o.dueDate); return d >= 0 && d <= 3; }), [open]);
  useEffect(() => { if (dueSoon.length > 0) { const t = setTimeout(() => setShowAlert(true), 600); return () => clearTimeout(t); } }, [dueSoon.length]);

  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
  const now = new Date();
  const month = transactions.filter((t) => { const d = new Date(t.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const income = month.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = month.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const taxOwed = transactions.filter((t) => t.type === "income" && t.isSale).reduce((s, t) => s + (t.taxAmount || 0), 0);

  // Contas a receber / pagar (saldo pendente) — NUNCA somadas ao saldo disponível
  const rec = useMemo(() => open.filter(o => o.direction === "receivable"), [open]);
  const pay = useMemo(() => open.filter(o => o.direction === "payable"), [open]);
  const openReceivables = rec.reduce((s, o) => s + o.outstandingAmount, 0);
  const openPayables = pay.reduce((s, o) => s + o.outstandingAmount, 0);
  const overdueReceivable = rec.filter(isOverdue);
  const overdueReceivableSum = overdueReceivable.reduce((s, o) => s + o.outstandingAmount, 0);
  const payable7List = pay.filter(o => daysUntil(o.dueDate) <= 7);
  const payable7 = payable7List.reduce((s, o) => s + o.outstandingAmount, 0);

  // Pagamentos do mês (liquidações posted)
  const monthSettlements = settlements.filter(s => s.status === "posted" && new Date(s.paymentDate).getMonth() === now.getMonth() && new Date(s.paymentDate).getFullYear() === now.getFullYear());
  const receivedMonth = monthSettlements.filter(s => s.direction === "incoming").reduce((s, x) => s + x.totalAmount, 0);
  const paidMonth = monthSettlements.filter(s => s.direction === "outgoing").reduce((s, x) => s + x.totalAmount, 0);

  // "Recursos"/"Compromissos", não "Ativo"/"Passivo": não é um balanço
  // contabilístico completo (falta imobilizado, existências, etc.), e capital
  // de sócios não é um passivo — é património da empresa. Ver capital em
  // /app/capital, não aqui.
  const recursos = totalBalance + openReceivables;
  const compromissos = openPayables + taxOwed;
  const liquidityRisk = payable7 > totalBalance;
  const liquidoReal = totalBalance - taxOwed;
  const resultadoMes = income - expense;

  const upcoming = useMemo(() => [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5), [open]);
  const topOverdueClients = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of overdueReceivable) m.set(o.contactId, (m.get(o.contactId) || 0) + o.outstandingAmount);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [overdueReceivable]);

  const docs = (n: number) => `${n} documento${n !== 1 ? "s" : ""}`;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-page">Bom dia, {profile.name.split(" ")[0]}</h1>
          <p className="text-sm text-ink-400 mt-1">Aqui está o pulso do teu negócio hoje.</p>
        </div>
        <Link href="/app/transacoes" className="btn-primary">Novo lançamento <ArrowRight size={15} /></Link>
      </header>

      <GettingStarted />

      <TrueAvailableBlock />

      {liquidityRisk && (
        <div className="card border-red-500/40 bg-red-500/5 p-4 flex gap-3 items-start">
          <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={19} />
          <div className="text-sm">
            <div className="font-semibold text-red-400">Risco de liquidez</div>
            <p className="text-ink-300 mt-0.5">Tens {fmtKz(payable7)} a pagar em 7 dias e {fmtKz(totalBalance)} em caixa. Cobra as {overdueReceivable.length} contas atrasadas ({fmtKz(overdueReceivableSum)}) ou reduz despesas esta semana.</p>
          </div>
        </div>
      )}

      {/* ─────────── Onde está o dinheiro ─────────── */}
      <section>
        <SectionHead
          title="Onde está o dinheiro"
          hint="Saldo de cada conta. É dinheiro que já tens na mão, hoje."
          action={<Link href="/app/contas" className="text-xs text-maka-400 hover:underline font-semibold">Gerir contas</Link>}
        />
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 stagger">
          {accounts.map((a) => {
            const st = ACC_STYLE[a.type]; const Icon = st.icon;
            return (
              <div key={a.id} className="card min-w-[200px] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12.5px] text-ink-400 font-medium">{st.label}</div>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${st.chip} ${st.tint}`}><Icon size={14} /></div>
                </div>
                <div className="mt-2 text-sm font-semibold truncate">{a.name}</div>
                <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{fmtKz(a.currentBalance)}</div>
              </div>
            );
          })}
          <div className="card min-w-[200px] p-4 border-maka-500/40 bg-maka-500/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12.5px] text-maka-400 font-medium">Total geral</div>
              <div className="h-7 w-7 rounded-lg bg-maka-500/15 flex items-center justify-center text-maka-400"><Wallet size={14} /></div>
            </div>
            <div className="mt-2 text-sm font-semibold">Todas as contas</div>
            <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-maka-400">{fmtKz(totalBalance)}</div>
            <p className="mt-2 text-[11px] leading-snug text-ink-500">Soma de todas as contas. Não inclui o que tens a receber.</p>
          </div>
          {accounts.length === 0 && (
            <Link href="/app/contas" className="card min-w-[200px] p-4 border-dashed flex flex-col items-center justify-center text-center hover:border-maka-500/50 transition-colors">
              <PiggyBank size={20} className="text-ink-500" />
              <div className="text-sm font-medium mt-2">Criar a primeira conta</div>
              <p className="text-[11px] text-ink-500 mt-1">Banco, carteira móvel ou caixa</p>
            </Link>
          )}
        </div>
      </section>

      {/* ─────────── Movimento do mês ─────────── */}
      <section>
        <SectionHead
          title="Movimento deste mês"
          hint="Dinheiro que entrou e saiu desde o dia 1 do mês corrente."
          action={<Link href="/app/transacoes" className="text-xs text-maka-400 hover:underline font-semibold">Ver lançamentos</Link>}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard label="Receitas do mês" value={fmtKz(income)} tone="pos" icon={TrendingUp}
            hint="Tudo o que entrou este mês: vendas e outras entradas de dinheiro." />
          <StatCard label="Despesas do mês" value={fmtKz(expense)} tone="neg" icon={TrendingDown}
            hint="Tudo o que saiu este mês: compras, salários, rendas e outros gastos." />
          <StatCard label="Resultado do mês" value={fmtKz(resultadoMes)} tone={resultadoMes >= 0 ? "pos" : "neg"} icon={Scale}
            hint="Receitas menos despesas. Positivo significa que o mês está a dar lucro em caixa." />
          <StatCard label="Recebido de clientes" value={fmtKz(receivedMonth)} tone="pos" icon={HandCoins}
            hint="Faturas que clientes pagaram este mês. Este dinheiro já entrou nas tuas contas." />
        </div>
      </section>

      {/* ─────────── A receber e a pagar ─────────── */}
      <section>
        <SectionHead
          title="A receber e a pagar"
          hint="Dinheiro que ainda não está na tua conta — promessas de entrada e de saída. Nunca é somado ao saldo."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard label="Total a receber" value={fmtKz(openReceivables)} tone="pos" icon={ArrowDownLeft} href="/app/faturas"
            footer={docs(rec.length)}
            hint="Tudo o que os clientes ainda te devem, esteja ou não vencido. Ainda NÃO é dinheiro teu — só conta quando pagarem." />
          <StatCard label="Vencido a receber" value={fmtKz(overdueReceivableSum)} tone="neg" icon={HandCoins} href="/app/cobrancas"
            footer={docs(overdueReceivable.length)}
            hint="A parte do 'Total a receber' que já passou da data combinada. É aqui que deves cobrar primeiro." />
          <StatCard label="Total a pagar" value={fmtKz(openPayables)} tone="neutral" icon={ArrowUpRight} href="/app/contas-a-pagar"
            footer={docs(pay.length)}
            hint="Tudo o que ainda deves a fornecedores, esteja ou não vencido." />
          <StatCard label="A pagar em 7 dias" value={fmtKz(payable7)} tone="warn" icon={CalendarClock}
            footer={docs(payable7List.length)}
            hint="Do total a pagar, o que vence nesta semana. Compara com o teu saldo para não ficares apertado." />
        </div>
      </section>

      {/* ─────────── Imposto e posição ─────────── */}
      <section>
        <SectionHead
          title="Imposto e posição do negócio"
          hint="Quanto do teu caixa é realmente teu, e como está o balanço geral."
          action={<Link href="/app/relatorios" className="text-xs text-maka-400 hover:underline font-semibold">Ver relatórios</Link>}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard label="Imposto do Estado" value={fmtKz(taxOwed)} tone="warn" icon={Receipt}
            hint="Imposto já incluído no preço das tuas vendas. Este dinheiro NÃO é teu — guarda-o para entregar ao Estado." />
          <StatCard label="Líquido real teu" value={fmtKz(liquidoReal)} tone="brand" icon={Wallet}
            hint="O saldo das contas menos o imposto a entregar. É o que sobra mesmo para o negócio." />
          <StatCard label="Recursos do negócio" value={fmtKz(recursos)} tone="pos" icon={Scale}
            hint="O que o negócio tem: dinheiro em caixa mais o que tens a receber dos clientes. Não é um balanço contabilístico completo." />
          <StatCard label="Compromissos do negócio" value={fmtKz(compromissos)} tone="neg" icon={Scale}
            hint="O que o negócio deve a terceiros: fornecedores e imposto por entregar. Não inclui capital dos sócios — vê isso em Capital dos sócios." />
        </div>
      </section>

      {/* ─────────── Listas ─────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 rise">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-1"><h2 className="font-semibold text-[15px]">Últimos lançamentos</h2><Link href="/app/transacoes" className="text-xs text-maka-400 hover:underline font-semibold">Ver todos</Link></div>
          <p className="text-[12px] text-ink-500 mb-3">As entradas e saídas mais recentes das tuas contas.</p>
          {/* Tabela em vez de linhas soltas: com cabeçalho, a coluna de valores
              ganha um título e os montantes alinham-se à direita numa coluna
              própria. É o padrão do Cota ("Pedido / Estado / Prazo") e é o que
              separa uma tabela de dados de uma lista empilhada. */}
          <table className="tbl tbl-flush">
            <thead>
              <tr>
                {/* max-w-0 + w-full: uma tabela dimensiona-se ao conteúdo, por
                    isso uma descrição longa empurra a largura para fora do
                    cartão (medido: transbordava 53px) e o `truncate` interior
                    nunca chegava a atuar. Encolher a célula ao mínimo é o que
                    devolve o controlo ao truncate. */}
                <th className="max-w-0 w-full">Lançamento</th>
                <th className="!text-right whitespace-nowrap">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 6).map((t) => {
                const isIn = t.type === "income" || t.type === "transfer_in" || t.type === "capital_in";
                return (
                  <tr key={t.id}>
                    <td className="max-w-0 w-full">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isIn ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{isIn ? <TrendingUp size={15} /> : <TrendingDown size={15} />}</div>
                        <div className="min-w-0">
                          <div className="text-sm truncate">{t.description}</div>
                          <div className="text-[12px] text-ink-500 truncate">{t.category} · {fmtDate(t.date)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`text-right font-semibold whitespace-nowrap pl-3 ${isIn ? "text-emerald-400" : "text-red-400"}`}>{isIn ? "+" : "−"}{fmtKz(t.amount)}</td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={2} className="py-6 text-center text-sm text-ink-500">Sem lançamentos ainda.</td></tr>
              )}
            </tbody>
          </table>
          {topOverdueClients.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hairline)" }}>
              <div className="text-[13px] font-medium">Principais clientes em atraso</div>
              <p className="text-[12px] text-ink-500 mt-0.5 mb-2">Quem te deve há mais tempo — começa a cobrança por aqui.</p>
              <div className="space-y-1.5">
                {topOverdueClients.map(([cid, val]) => (
                  <div key={cid} className="flex justify-between text-sm"><span className="text-ink-300">{contactName(cid)}</span><span className="font-semibold text-red-400 tabular-nums">{fmtKz(val)}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-[15px]">Próximos vencimentos</h2>
          <p className="text-[12px] text-ink-500 mb-3 mt-0.5">Faturas a receber e contas a pagar com data mais próxima.</p>
          <div className="space-y-2.5">
            {upcoming.map((o) => {
              const d = daysUntil(o.dueDate);
              return (
                <Link key={o.id} href={o.direction === "receivable" ? "/app/faturas" : "/app/contas-a-pagar"} className="block rounded-lg border border-ink-800 p-3 hover:border-maka-500/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{contactName(o.contactId)}</div><div className={`text-[11px] ${isOverdue(o) ? "text-red-400" : d <= 3 ? "text-yellow-400" : "text-ink-500"}`}>{d < 0 ? `Venceu há ${Math.abs(d)} dia${Math.abs(d) !== 1 ? "s" : ""}` : `Vence em ${d} dia${d !== 1 ? "s" : ""}`}</div></div>
                    <div className={`text-sm font-semibold ${o.direction === "receivable" ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(o.outstandingAmount)}</div>
                  </div>
                  <div className="mt-1.5"><DirTag direction={o.direction} /></div>
                </Link>
              );
            })}
            {upcoming.length === 0 && <div className="text-sm text-ink-500 text-center py-4">Sem vencimentos pendentes.</div>}
          </div>
        </div>
      </section>

      {showAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 border-maka-500/40">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-maka-500/15 flex items-center justify-center text-maka-400"><BellRing size={19} /></div><h3 className="font-display text-lg">Vencimentos próximos</h3></div>
              <button onClick={() => setShowAlert(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-300 mt-3">Tens {dueSoon.length} documento{dueSoon.length !== 1 ? "s" : ""} a vencer nos próximos 3 dias:</p>
            <div className="mt-3 space-y-2">
              {dueSoon.map((o) => (
                <div key={o.id} className="rounded-lg bg-ink-950 border border-ink-800 px-3 py-2">
                  <div className="flex justify-between text-sm"><span className="font-medium">{contactName(o.contactId)}</span><span className="font-semibold">{fmtKz(o.outstandingAmount)}</span></div>
                  <div className="mt-1 flex items-center justify-between"><DirTag direction={o.direction} /><span className="text-[11px] text-ink-500">{fmtDate(o.dueDate)}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 justify-end"><button onClick={() => setShowAlert(false)} className="btn-ghost">Mais tarde</button><Link href="/app/faturas" onClick={() => setShowAlert(false)} className="btn-primary">Ver documentos</Link></div>
          </div>
        </div>
      )}
    </div>
  );
}
