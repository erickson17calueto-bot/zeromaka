"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, REGIMES } from "@/lib/data";
import { FileBarChart, TrendingUp, Scale, Receipt } from "lucide-react";

type Tab = "dre" | "dfc" | "impostos" | "balanco";

export default function RelatoriosPage() {
  const { transactions, obligations, accounts, company } = useStore();
  const [tab, setTab] = useState<Tab>("dre");
  const [period, setPeriod] = useState<"month" | "all">("month");

  const now = new Date();
  const inPeriod = (iso: string) => {
    if (period === "all") return true;
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const tx = useMemo(() => transactions.filter((t) => inPeriod(t.date)), [transactions, period]);

  const saleIncome = tx.filter((t) => t.type === "income" && t.isSale);
  const otherIncome = tx.filter((t) => t.type === "income" && !t.isSale);
  const expenses = tx.filter((t) => t.type === "expense");

  const salesBase = saleIncome.reduce((s, t) => s + (t.amount - (t.taxAmount || 0)), 0);
  const taxCollected = saleIncome.reduce((s, t) => s + (t.taxAmount || 0), 0);
  const otherRev = otherIncome.reduce((s, t) => s + t.amount, 0);
  const totalRev = salesBase + otherRev;

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.forEach((t) => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const result = totalRev - totalExp;

  const cashIn = tx.filter((t) => t.type === "income" || t.type === "capital_in").reduce((s, t) => s + t.amount, 0);
  const cashOut = tx.filter((t) => t.type === "expense" || t.type === "capital_out").reduce((s, t) => s + t.amount, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);

  const openObl = obligations.filter((o) => o.lifecycleStatus === "open" && o.outstandingAmount > 0);
  const openReceivables = openObl.filter((o) => o.direction === "receivable").reduce((s, o) => s + o.outstandingAmount, 0);
  const openPayables = openObl.filter((o) => o.direction === "payable").reduce((s, o) => s + o.outstandingAmount, 0);
  const capitalIn = transactions.filter((t) => t.type === "capital_in").reduce((s, t) => s + t.amount, 0);
  const capitalOut = transactions.filter((t) => t.type === "capital_out").reduce((s, t) => s + t.amount, 0);
  const shareholderLoans = capitalIn - capitalOut;
  const taxOwedAll = transactions.filter((t) => t.type === "income" && t.isSale).reduce((s, t) => s + (t.taxAmount || 0), 0);

  const ativo = totalBalance + openReceivables;
  const passivo = openPayables + shareholderLoans + taxOwedAll;
  const patrimonio = ativo - passivo;

  const TABS = [
    { id: "dre" as Tab, label: "DRE", icon: TrendingUp },
    { id: "dfc" as Tab, label: "Fluxo de Caixa", icon: FileBarChart },
    { id: "impostos" as Tab, label: "Impostos", icon: Receipt },
    { id: "balanco" as Tab, label: "Ativo / Passivo", icon: Scale }
  ];

  const Row = ({ label, value, bold, tone, indent }: { label: string; value: number; bold?: boolean; tone?: "pos" | "neg" | "muted"; indent?: boolean }) => (
    <div className={`flex justify-between py-2 ${bold ? "border-t border-ink-700 mt-1 font-semibold" : "border-b border-ink-800/60"} ${indent ? "pl-4" : ""}`}>
      <span className={tone === "muted" ? "text-ink-400" : ""}>{label}</span>
      <span className={`font-mono ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : bold ? "" : "text-ink-200"}`}>{fmtKz(value)}</span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Relatórios</h1>
          <p className="text-sm text-ink-400 mt-1">{company.name} · {REGIMES[company.regime].short}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-700 p-1">
          <button onClick={() => setPeriod("month")} className={`px-3 py-1 text-[12px] rounded ${period === "month" ? "bg-maka-500 text-ink-950 font-semibold" : "text-ink-400"}`}>Este mês</button>
          <button onClick={() => setPeriod("all")} className={`px-3 py-1 text-[12px] rounded ${period === "all" ? "bg-maka-500 text-ink-950 font-semibold" : "text-ink-400"}`}>Acumulado</button>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm border transition-colors ${tab === t.id ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dre" && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">Demonstração do Resultado (DRE)</h2>
          <p className="text-[12px] text-ink-500 mb-4">O imposto das vendas não entra como receita — é dinheiro do Estado.</p>
          <Row label="Receita de vendas (líquida de imposto)" value={salesBase} tone="pos" />
          <Row label="Outras receitas" value={otherRev} tone="pos" />
          <Row label="Receita total" value={totalRev} bold />
          <div className="h-3" />
          {byCategory.map(([cat, val]) => <Row key={cat} label={cat} value={-val} tone="neg" indent />)}
          <Row label="Total de despesas" value={-totalExp} bold tone="neg" />
          <div className="h-3" />
          <div className={`flex justify-between py-3 px-4 rounded-lg mt-2 ${result >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
            <span className="font-semibold">Resultado do exercício</span>
            <span className={`font-display text-lg ${result >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(result)}</span>
          </div>
        </div>
      )}

      {tab === "dfc" && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">Demonstração do Fluxo de Caixa (DFC)</h2>
          <p className="text-[12px] text-ink-500 mb-4">Movimento real de dinheiro — inclui imposto cobrado e capital dos sócios.</p>
          <Row label="Entradas de caixa (recebimentos + aportes)" value={cashIn} tone="pos" />
          <Row label="Saídas de caixa (pagamentos + retiradas)" value={-cashOut} tone="neg" />
          <Row label="Fluxo líquido do período" value={cashIn - cashOut} bold tone={cashIn - cashOut >= 0 ? "pos" : "neg"} />
          <div className="h-4" />
          <div className="flex justify-between py-3 px-4 rounded-lg bg-maka-500/10 mt-2">
            <span className="font-semibold">Saldo atual em caixa e bancos</span>
            <span className="font-display text-lg text-maka-400">{fmtKz(totalBalance)}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-lg bg-ink-950 border border-ink-800 p-3 text-center">
                <div className="text-[11px] text-ink-500 truncate">{a.name}</div>
                <div className="text-sm font-semibold mt-1">{fmtKz(a.currentBalance)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "impostos" && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">Apuramento de impostos sobre vendas</h2>
          <p className="text-[12px] text-ink-500 mb-4">Regime da empresa: {REGIMES[company.regime].label} — {REGIMES[company.regime].tax}. Só as vendas geram imposto.</p>
          <Row label="Base de vendas tributáveis" value={salesBase} />
          <Row label={`Imposto sobre vendas (${REGIMES[company.regime].tax})`} value={taxCollected} tone="muted" />
          <div className="h-4" />
          <div className="flex justify-between py-3 px-4 rounded-lg bg-yellow-500/10 mt-2">
            <div>
              <span className="font-semibold text-yellow-300">A entregar ao Estado</span>
              <div className="text-[11px] text-ink-400 mt-0.5">Separa este valor — não é teu lucro.</div>
            </div>
            <span className="font-display text-lg text-yellow-400">{fmtKz(taxCollected)}</span>
          </div>
          <div className="mt-4 rounded-lg border border-ink-800 p-4">
            <div className="text-[12px] text-ink-400">Acumulado total (todas as vendas registadas)</div>
            <div className="font-display text-lg mt-1">{fmtKz(taxOwedAll)}</div>
          </div>
        </div>
      )}

      {tab === "balanco" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-emerald-400 mb-3">Ativo (o que a empresa tem)</h3>
              <Row label="Caixa e bancos" value={totalBalance} />
              <Row label="Contas a receber (clientes)" value={openReceivables} />
              <Row label="Total do ativo" value={ativo} bold tone="pos" />
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-red-400 mb-3">Passivo (o que a empresa deve)</h3>
              <Row label="Contas a pagar (fornecedores)" value={openPayables} />
              <Row label="Capital dos sócios (suprimentos)" value={shareholderLoans} />
              <Row label="Impostos a entregar" value={taxOwedAll} />
              <Row label="Total do passivo" value={passivo} bold tone="neg" />
            </div>
          </div>
          <div className="card p-5">
            <div className={`flex justify-between py-3 px-4 rounded-lg ${patrimonio >= 0 ? "bg-maka-500/10" : "bg-red-500/10"}`}>
              <div>
                <span className="font-semibold">Património líquido (Ativo − Passivo)</span>
                <div className="text-[11px] text-ink-400 mt-0.5">O valor real da empresa depois de pagar tudo.</div>
              </div>
              <span className={`font-display text-lg ${patrimonio >= 0 ? "text-maka-400" : "text-red-400"}`}>{fmtKz(patrimonio)}</span>
            </div>
          </div>
        </div>
      )}

      <p className="text-[12px] text-ink-500">
        Relatórios simplificados para gestão diária e para entregar ao contabilista. Não substituem a contabilidade oficial certificada.
      </p>
    </div>
  );
}
