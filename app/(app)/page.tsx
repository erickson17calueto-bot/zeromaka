"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, daysUntil } from "@/lib/data";
import { Landmark, Smartphone, Banknote, TrendingUp, TrendingDown, AlertTriangle, X, ArrowRight, BellRing, Receipt, Scale, ArrowDownLeft, ArrowUpRight } from "lucide-react";

const ACC_STYLE = {
  bank: { icon: Landmark, bg: "bg-maka-500/10 border-maka-500/30", tint: "text-maka-400", label: "Conta bancária" },
  mobile_money: { icon: Smartphone, bg: "bg-emerald-500/10 border-emerald-500/30", tint: "text-emerald-400", label: "Carteira móvel" },
  cash: { icon: Banknote, bg: "bg-yellow-500/10 border-yellow-500/30", tint: "text-yellow-400", label: "Caixa físico" }
} as const;

// Etiqueta que identifica o tipo de fatura no pop-up e nas listas
function InvoiceTag({ type }: { type: "receivable" | "payable" }) {
  const recv = type === "receivable";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${recv ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
      {recv ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
      {recv ? "A receber · cliente" : "A pagar · fornecedor"}
    </span>
  );
}

export default function Dashboard() {
  const { accounts, transactions, invoices, profile } = useStore();
  const [showAlert, setShowAlert] = useState(false);

  const dueSoon = useMemo(() => invoices.filter((i) => i.status !== "paid" && daysUntil(i.dueDate) >= 0 && daysUntil(i.dueDate) <= 3), [invoices]);
  useEffect(() => { if (dueSoon.length > 0) { const t = setTimeout(() => setShowAlert(true), 600); return () => clearTimeout(t); } }, [dueSoon.length]);

  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
  const now = new Date();
  const month = transactions.filter((t) => { const d = new Date(t.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const income = month.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = month.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  // Imposto já recebido (contido nas vendas liquidadas) — dinheiro que está no caixa mas é do Estado
  const taxOwed = transactions.filter((t) => t.type === "income" && t.isSale).reduce((s, t) => s + (t.taxAmount || 0), 0);
  const openReceivables = invoices.filter((i) => i.type === "receivable" && i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const openPayables = invoices.filter((i) => i.type === "payable" && i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const capIn = transactions.filter((t) => t.type === "capital_in").reduce((s, t) => s + t.amount, 0);
  const capOut = transactions.filter((t) => t.type === "capital_out").reduce((s, t) => s + t.amount, 0);
  const ativo = totalBalance + openReceivables;
  const passivo = openPayables + (capIn - capOut) + taxOwed;

  const payable7 = invoices.filter((i) => i.type === "payable" && i.status !== "paid" && daysUntil(i.dueDate) <= 7).reduce((s, i) => s + i.amount, 0);
  const liquidityRisk = payable7 > totalBalance;
  const overdueReceivable = invoices.filter((i) => i.type === "receivable" && i.status === "overdue");
  const liquidoReal = totalBalance - taxOwed;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Bom dia, {profile.name.split(" ")[0]}</h1>
          <p className="text-sm text-ink-400 mt-1">Aqui está o pulso do teu negócio hoje.</p>
        </div>
        <Link href="/transacoes" className="btn-primary">Novo lançamento <ArrowRight size={15} /></Link>
      </header>

      {liquidityRisk && (
        <div className="card border-red-500/40 bg-red-500/5 p-4 flex gap-3 items-start">
          <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={19} />
          <div className="text-sm">
            <div className="font-semibold text-red-300">Risco de liquidez</div>
            <p className="text-ink-300 mt-0.5">Tens {fmtKz(payable7)} a pagar em 7 dias e {fmtKz(totalBalance)} em caixa. Cobra as {overdueReceivable.length} faturas atrasadas ({fmtKz(overdueReceivable.reduce((s, i) => s + i.amount, 0))}) ou reduz despesas esta semana.</p>
          </div>
        </div>
      )}

      <section>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {accounts.map((a) => {
            const st = ACC_STYLE[a.type]; const Icon = st.icon;
            return (
              <div key={a.id} className={`card min-w-[210px] border p-4 ${st.bg}`}>
                <div className={`flex items-center gap-2 text-xs ${st.tint}`}><Icon size={15} /> {st.label}</div>
                <div className="mt-2 font-semibold text-sm">{a.name}</div>
                <div className="mt-1 font-display text-lg">{fmtKz(a.currentBalance)}</div>
              </div>
            );
          })}
          <div className="card min-w-[210px] p-4 border-ink-700">
            <div className="text-xs text-ink-400">Total geral</div>
            <div className="mt-2 font-semibold text-sm">Todas as contas</div>
            <div className="mt-1 font-display text-lg text-maka-400">{fmtKz(totalBalance)}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Receitas do mês</div><div className="mt-1.5 font-display text-lg text-emerald-400 flex items-center gap-1.5"><TrendingUp size={16} />{fmtKz(income)}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Despesas do mês</div><div className="mt-1.5 font-display text-lg text-red-400 flex items-center gap-1.5"><TrendingDown size={16} />{fmtKz(expense)}</div></div>
        <div className="card p-4 border-yellow-500/30"><div className="text-[11px] uppercase tracking-wider text-yellow-500/80 font-bold flex items-center gap-1"><Receipt size={12} /> Imposto do Estado</div><div className="mt-1.5 font-display text-lg text-yellow-400">{fmtKz(taxOwed)}</div><div className="text-[10px] text-ink-500 mt-0.5">Contido nas vendas — não é teu</div></div>
        <div className="card p-4 border-maka-500/30"><div className="text-[11px] uppercase tracking-wider text-maka-400/90 font-bold">Líquido real teu</div><div className="mt-1.5 font-display text-lg text-maka-400">{fmtKz(liquidoReal)}</div><div className="text-[10px] text-ink-500 mt-0.5">Caixa − imposto</div></div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold flex items-center gap-1"><Scale size={12} /> Ativo</div><div className="mt-1.5 font-display text-lg text-emerald-400">{fmtKz(ativo)}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Passivo</div><div className="mt-1.5 font-display text-lg text-red-400">{fmtKz(passivo)}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Património líquido</div><div className="mt-1.5 font-display text-lg">{fmtKz(ativo - passivo)}</div></div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Últimos lançamentos</h2><Link href="/transacoes" className="text-xs text-maka-400 hover:underline">Ver todos</Link></div>
          <div className="divide-y divide-ink-800">
            {transactions.slice(0, 6).map((t) => {
              const isIn = t.type === "income" || t.type === "transfer_in" || t.type === "capital_in";
              return (
                <div key={t.id} className="py-2.5 flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isIn ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{isIn ? <TrendingUp size={15} /> : <TrendingDown size={15} />}</div>
                  <div className="min-w-0 flex-1"><div className="text-sm truncate">{t.description}</div><div className="text-[11px] text-ink-500">{t.category} · {fmtDate(t.date)}</div></div>
                  <div className={`text-sm font-semibold ${isIn ? "text-emerald-400" : "text-red-400"}`}>{isIn ? "+" : "−"}{fmtKz(t.amount)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4">Faturas a vencer</h2>
          <div className="space-y-2.5">
            {invoices.filter((i) => i.status !== "paid").slice(0, 5).map((i) => {
              const d = daysUntil(i.dueDate);
              return (
                <Link key={i.id} href="/faturas" className="block rounded-lg border border-ink-800 p-3 hover:border-ink-600 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{i.contactName}</div><div className={`text-[11px] ${i.status === "overdue" ? "text-red-400" : d <= 3 ? "text-yellow-400" : "text-ink-500"}`}>{i.status === "overdue" ? `Venceu há ${Math.abs(d)} dia${Math.abs(d) !== 1 ? "s" : ""}` : `Vence em ${d} dia${d !== 1 ? "s" : ""}`}</div></div>
                    <div className={`text-sm font-semibold ${i.type === "receivable" ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(i.amount)}</div>
                  </div>
                  <div className="mt-1.5"><InvoiceTag type={i.type} /></div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {showAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 border-maka-500/40">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-maka-500/15 flex items-center justify-center text-maka-400"><BellRing size={19} /></div><h3 className="font-display text-lg">Vencimentos próximos</h3></div>
              <button onClick={() => setShowAlert(false)} className="text-ink-400 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-300 mt-3">Tens {dueSoon.length} fatura{dueSoon.length !== 1 ? "s" : ""} a vencer nos próximos 3 dias:</p>
            <div className="mt-3 space-y-2">
              {dueSoon.map((i) => (
                <div key={i.id} className="rounded-lg bg-ink-950 border border-ink-800 px-3 py-2">
                  <div className="flex justify-between text-sm"><span className="font-medium">{i.contactName}</span><span className="font-semibold">{fmtKz(i.amount)}</span></div>
                  <div className="mt-1 flex items-center justify-between"><InvoiceTag type={i.type} /><span className="text-[11px] text-ink-500">{fmtDate(i.dueDate)}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 justify-end"><button onClick={() => setShowAlert(false)} className="btn-ghost">Mais tarde</button><Link href="/faturas" onClick={() => setShowAlert(false)} className="btn-primary">Ver faturas</Link></div>
          </div>
        </div>
      )}
    </div>
  );
}
