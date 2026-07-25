"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, REGIMES } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { REPORT_RPC } from "@/lib/reports/types";
import { FileBarChart, TrendingUp, Scale, Receipt, Download, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";

type Tab = "dre" | "dfc" | "impostos" | "balanco";
const TAB_REPORT: Record<Tab, keyof typeof REPORT_RPC | null> = {
  dre: "income_statement", dfc: "cash_flow_statement", impostos: "tax_control", balanco: null,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function RelatoriosPage() {
  const { obligations, accounts, transactions, company, orgId } = useStore();
  const [tab, setTab] = useState<Tab>("dre");
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [srv, setSrv] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  const now = new Date();
  const periodDates = useCallback(() => {
    if (period === "all") return { start: "2000-01-01", end: new Date().toISOString().slice(0, 10) };
    const y = now.getFullYear(), m = now.getMonth();
    const pad = (n: number) => String(n).padStart(2, "0");
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ecrã consome o MESMO cálculo do servidor que o PDF/Excel
  useEffect(() => {
    const reportType = TAB_REPORT[tab];
    if (!reportType || !orgId) { setSrv(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    const { start, end } = periodDates();
    const args: any = reportType === "income_statement"
      ? { p_org_id: orgId, p_start: start, p_end: end, p_include_reversed: false }
      : { p_org_id: orgId, p_start: start, p_end: end };
    createClient().rpc(REPORT_RPC[reportType], args).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setErr(error.message); else setSrv(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, period, orgId, periodDates]);

  const exportFile = async (format: "pdf" | "xlsx") => {
    const reportType = TAB_REPORT[tab];
    if (!reportType || !orgId) return;
    setExporting(format);
    try {
      const { start, end } = periodDates();
      const res = await fetch(`/api/reports/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, organizationId: orgId, startDate: start, endDate: end }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("Erro na exportação: " + (e.error || res.status)); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || `relatorio.${format}`;
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } finally { setExporting(null); }
  };

  // Balanço de gestão (rascunho) — ainda calculado no cliente, claramente assinalado
  const bal = useMemo(() => {
    const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
    const openObl = obligations.filter((o) => o.lifecycleStatus === "open" && o.outstandingAmount > 0);
    const openReceivables = openObl.filter((o) => o.direction === "receivable").reduce((s, o) => s + o.outstandingAmount, 0);
    const openPayables = openObl.filter((o) => o.direction === "payable").reduce((s, o) => s + o.outstandingAmount, 0);
    const capIn = transactions.filter((t) => t.type === "capital_in").reduce((s, t) => s + t.amount, 0);
    const capOut = transactions.filter((t) => t.type === "capital_out").reduce((s, t) => s + t.amount, 0);
    const taxOwed = transactions.filter((t) => t.type === "income" && t.isSale).reduce((s, t) => s + (t.taxAmount || 0), 0);
    const ativo = totalBalance + openReceivables;
    const passivo = openPayables + (capIn - capOut) + taxOwed;
    return { totalBalance, openReceivables, openPayables, shareholderLoans: capIn - capOut, taxOwed, ativo, passivo, patrimonio: ativo - passivo };
  }, [accounts, obligations, transactions]);

  const TABS = [
    { id: "dre" as Tab, label: "Resultado de Caixa", icon: TrendingUp },
    { id: "dfc" as Tab, label: "Fluxo de Caixa", icon: FileBarChart },
    { id: "impostos" as Tab, label: "Impostos", icon: Receipt },
    { id: "balanco" as Tab, label: "Balanço (gestão)", icon: Scale },
  ];

  const Row = ({ label, value, bold, tone, indent }: { label: string; value: number; bold?: boolean; tone?: "pos" | "neg" | "muted"; indent?: boolean }) => (
    <div className={`flex justify-between py-2 ${bold ? "border-t border-ink-700 mt-1 font-semibold" : "border-b border-ink-800/60"} ${indent ? "pl-4" : ""}`}>
      <span className={tone === "muted" ? "text-ink-400" : ""}>{label}</span>
      <span className={`font-mono ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : bold ? "" : "text-ink-200"}`}>{fmtKz(value)}</span>
    </div>
  );

  const warnings: string[] = srv?.meta?.warnings || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Relatórios</h1>
          <p className="text-sm text-ink-400 mt-1">{company.name} · {REGIMES[company.regime].short} · base de caixa</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-ink-700 p-1">
            <button onClick={() => setPeriod("month")} className={`px-3 py-1 text-[12px] rounded ${period === "month" ? "bg-maka-500 text-ink-950 font-semibold" : "text-ink-400"}`}>Este mês</button>
            <button onClick={() => setPeriod("all")} className={`px-3 py-1 text-[12px] rounded ${period === "all" ? "bg-maka-500 text-ink-950 font-semibold" : "text-ink-400"}`}>Acumulado</button>
          </div>
          {TAB_REPORT[tab] && (
            <>
              <button onClick={() => exportFile("pdf")} disabled={!!exporting} className="btn-ghost text-sm px-3 py-1.5 disabled:opacity-50" title="Exportar PDF (servidor)">
                {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
              </button>
              <button onClick={() => exportFile("xlsx")} disabled={!!exporting} className="btn-ghost text-sm px-3 py-1.5 disabled:opacity-50" title="Exportar Excel (servidor)">
                {exporting === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
              </button>
            </>
          )}
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

      {TAB_REPORT[tab] && loading && (
        <div className="card p-8 flex items-center justify-center text-ink-500 text-sm gap-2"><Loader2 size={16} className="animate-spin" /> A calcular no servidor…</div>
      )}
      {TAB_REPORT[tab] && err && (
        <div className="card p-6 border-red-500/40 bg-red-500/5 text-sm text-red-300 flex gap-2"><AlertTriangle size={16} /> Erro ao calcular: {err}</div>
      )}

      {tab === "dre" && srv && !loading && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">{srv.meta.title}</h2>
          <p className="text-[12px] text-ink-500 mb-4">Calculado no servidor. O imposto das vendas não entra como receita — é dinheiro do Estado.</p>
          {(srv.revenue.lines || []).map((l: any) => <Row key={l.category} label={l.category} value={Number(l.amount)} tone="pos" indent />)}
          <Row label="Receita total" value={Number(srv.revenue.total_revenue)} bold />
          <div className="h-3" />
          {(srv.expenses.lines || []).map((l: any) => <Row key={l.category} label={l.category} value={-Number(l.amount)} tone="neg" indent />)}
          <Row label="Total de despesas" value={-Number(srv.expenses.total)} bold tone="neg" />
          <div className={`flex justify-between py-3 px-4 rounded-lg mt-3 ${Number(srv.net_result) >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
            <span className="font-semibold">Resultado do período</span>
            <span className={`font-display text-lg ${Number(srv.net_result) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(Number(srv.net_result))}</span>
          </div>
        </div>
      )}

      {tab === "dfc" && srv && !loading && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">{srv.meta.title}</h2>
          <p className="text-[12px] text-ink-500 mb-4">Método direto. Transferências internas não entram como fluxo.</p>
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mt-1 mb-1">Operacional</div>
          <Row label="Recebimentos" value={Number(srv.operating.receipts)} tone="pos" indent />
          <Row label="Pagamentos" value={-Number(srv.operating.payments)} tone="neg" indent />
          <Row label="Fluxo operacional" value={Number(srv.operating.net)} bold />
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mt-3 mb-1">Financiamento</div>
          <Row label="Entradas de capital" value={Number(srv.financing.capital_in)} tone="pos" indent />
          <Row label="Retiradas" value={-Number(srv.financing.capital_out)} tone="neg" indent />
          <Row label="Fluxo de financiamento" value={Number(srv.financing.net)} bold />
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mt-3 mb-1">Reconciliação</div>
          <Row label="Saldo inicial" value={Number(srv.opening_balance)} />
          <Row label="Saldos iniciais e outros no período" value={Number(srv.other.net)} tone="muted" />
          <Row label="Variação líquida" value={Number(srv.net_change)} bold />
          <div className="flex justify-between py-3 px-4 rounded-lg bg-maka-500/10 mt-3">
            <span className="font-semibold">Saldo final em caixa e bancos</span>
            <span className="font-display text-lg text-maka-400">{fmtKz(Number(srv.closing_balance))}</span>
          </div>
        </div>
      )}

      {tab === "impostos" && srv && !loading && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">Controlo fiscal sobre vendas</h2>
          <p className="text-[12px] text-ink-500 mb-4">Regime: {REGIMES[company.regime].label} — {REGIMES[company.regime].tax}. Só as vendas geram imposto.</p>
          <Row label="Base de vendas tributáveis" value={Number(srv.taxable_base)} />
          <Row label="Imposto sobre vendas (por dentro)" value={Number(srv.tax_collected)} tone="muted" />
          <Row label="Receitas não-venda (sem imposto)" value={Number(srv.non_sale_income)} tone="muted" />
          <div className="flex justify-between py-3 px-4 rounded-lg bg-yellow-500/10 mt-3">
            <div><span className="font-semibold text-yellow-300">A entregar ao Estado (estimativa)</span><div className="text-[11px] text-ink-400 mt-0.5">Separa este valor — não é teu lucro.</div></div>
            <span className="font-display text-lg text-yellow-400">{fmtKz(Number(srv.estimated_payable))}</span>
          </div>
        </div>
      )}

      {tab === "balanco" && (
        <div className="space-y-4">
          <div className="card p-3 border-yellow-500/30 bg-yellow-500/5 text-[12px] text-yellow-300/90 flex gap-2 items-start">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Balanço de <strong>gestão</strong> (rascunho) — construído a partir de caixa, contas a receber/pagar e capital. Não fecha por partidas dobradas nem substitui um balanço contabilístico oficial.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-emerald-400 mb-3">Ativo</h3>
              <Row label="Caixa e bancos" value={bal.totalBalance} />
              <Row label="Contas a receber (clientes)" value={bal.openReceivables} />
              <Row label="Total do ativo" value={bal.ativo} bold tone="pos" />
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-red-400 mb-3">Passivo</h3>
              <Row label="Contas a pagar (fornecedores)" value={bal.openPayables} />
              <Row label="Capital dos sócios (suprimentos)" value={bal.shareholderLoans} />
              <Row label="Impostos a entregar" value={bal.taxOwed} />
              <Row label="Total do passivo" value={bal.passivo} bold tone="neg" />
            </div>
          </div>
          <div className="card p-5">
            <div className={`flex justify-between py-3 px-4 rounded-lg ${bal.patrimonio >= 0 ? "bg-maka-500/10" : "bg-red-500/10"}`}>
              <div><span className="font-semibold">Património líquido (Ativo − Passivo)</span></div>
              <span className={`font-display text-lg ${bal.patrimonio >= 0 ? "text-maka-400" : "text-red-400"}`}>{fmtKz(bal.patrimonio)}</span>
            </div>
          </div>
        </div>
      )}

      {TAB_REPORT[tab] && warnings.length > 0 && !loading && (
        <div className="card p-4 text-[11px] text-ink-500 space-y-1">
          <div className="font-semibold text-ink-400">Notas metodológicas</div>
          {warnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}
    </div>
  );
}
