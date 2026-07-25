"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, REGIMES } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { REPORT_RPC, StatementResult, StmtLine } from "@/lib/reports/types";
import { FileBarChart, TrendingUp, Scale, Receipt, Download, Loader2, FileSpreadsheet, AlertTriangle, CalendarClock } from "lucide-react";

type Tab = "dre" | "dfc" | "impostos" | "aging" | "balanco";
type Cmp = "none" | "prev" | "year";
const TAB_REPORT: Record<Tab, keyof typeof REPORT_RPC | null> = {
  dre: "income_statement", dfc: "cash_flow_statement", impostos: "tax_control",
  aging: "aging", balanco: null,
};
const pad = (n: number) => String(n).padStart(2, "0");
// Demonstração formal: linhas presentes mostram sempre o valor (incl. 0 Kz).
// Só as células de comparação genuinamente inexistentes (null) ficam com "—".
const money = (v: number) => fmtKz(v);

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function RelatoriosPage() {
  const { obligations, accounts, transactions, company, orgId } = useStore();
  const [tab, setTab] = useState<Tab>("dre");
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [cmp, setCmp] = useState<Cmp>("none");
  const [srv, setSrv] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  const now = new Date();
  const periodDates = useCallback(() => {
    if (period === "all") return { start: "2000-01-01", end: new Date().toISOString().slice(0, 10) };
    const y = now.getFullYear(), m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const cmpDates = useCallback((): { start: string; end: string } | null => {
    if (cmp === "none" || period === "all") return null;
    const y = now.getFullYear(), m = now.getMonth();
    if (cmp === "prev") {
      const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
      const last = new Date(py, pm + 1, 0).getDate();
      return { start: `${py}-${pad(pm + 1)}-01`, end: `${py}-${pad(pm + 1)}-${pad(last)}` };
    }
    const last = new Date(y - 1, m + 1, 0).getDate();
    return { start: `${y - 1}-${pad(m + 1)}-01`, end: `${y - 1}-${pad(m + 1)}-${pad(last)}` };
  }, [cmp, period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reportType = TAB_REPORT[tab];
    if (!reportType || !orgId) { setSrv(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null);
    const { start, end } = periodDates();
    const c = cmpDates();
    const args: any = { p_org_id: orgId, p_start: start, p_end: end, p_cmp_start: c?.start ?? null, p_cmp_end: c?.end ?? null };
    if (reportType === "income_statement") args.p_include_reversed = false;
    createClient().rpc(REPORT_RPC[reportType], args).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setErr(error.message); else setSrv(data as StatementResult);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, period, cmp, orgId, periodDates, cmpDates]);

  const exportFile = async (format: "pdf" | "xlsx") => {
    const reportType = TAB_REPORT[tab];
    if (!reportType || !orgId) return;
    setExporting(format);
    try {
      const { start, end } = periodDates();
      const c = cmpDates();
      const res = await fetch(`/api/reports/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, organizationId: orgId, startDate: start, endDate: end, cmpStartDate: c?.start ?? null, cmpEndDate: c?.end ?? null }),
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

  // Balanço de gestão (rascunho) — cliente, assinalado
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
    { id: "aging" as Tab, label: "Antiguidade de saldos", icon: CalendarClock },
    { id: "balanco" as Tab, label: "Balanço (gestão)", icon: Scale },
  ];

  const hasCmp = !!srv?.meta?.has_comparison;
  const warnings: string[] = srv?.meta?.warnings || [];

  const BalRow = ({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: "pos" | "neg" }) => (
    <div className={`flex justify-between py-2 ${bold ? "border-t border-ink-700 mt-1 font-semibold" : "border-b border-ink-800/60"}`}>
      <span>{label}</span>
      <span className={`font-mono ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : ""}`}>{fmtKz(value)}</span>
    </div>
  );

  const numCell = (v: number | null, muted?: boolean) => (
    <div className={`w-28 text-right font-mono text-sm ${v === null ? "text-ink-600" : muted ? "text-ink-400" : v < 0 ? "text-red-400" : v > 0 ? "text-emerald-400" : "text-ink-300"}`}>
      {v === null ? "—" : money(v)}
    </div>
  );
  const StmtRow = ({ l, variant }: { l: StmtLine; variant: "line" | "sub" | "total" }) => (
    <div className={`flex items-center gap-2 px-3 ${variant === "total" ? "py-3 mt-2 rounded-lg bg-emerald-500/10 font-semibold" : variant === "sub" ? "py-2 bg-maka-500/5 font-semibold border-t border-ink-700" : "py-1.5 border-b border-ink-800/50"}`}>
      <div className={`flex-1 ${variant === "total" ? "text-base" : "text-sm"}`}>{l.label}</div>
      {numCell(l.current)}
      {hasCmp && numCell(l.comparison, true)}
      {hasCmp && numCell(l.difference)}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Relatórios</h1>
          <p className="text-sm text-ink-400 mt-1">{company.name} · {REGIMES[company.regime].short} · base de caixa</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 rounded-lg border border-ink-700 p-1">
            <button onClick={() => setPeriod("month")} className={`px-3 py-1 text-[12px] rounded ${period === "month" ? "bg-maka-500 text-onbrand font-semibold" : "text-ink-400"}`}>Este mês</button>
            <button onClick={() => setPeriod("all")} className={`px-3 py-1 text-[12px] rounded ${period === "all" ? "bg-maka-500 text-onbrand font-semibold" : "text-ink-400"}`}>Acumulado</button>
          </div>
          {TAB_REPORT[tab] && period === "month" && (
            <select value={cmp} onChange={(e) => setCmp(e.target.value as Cmp)} className="input text-[12px] py-1.5 w-auto">
              <option value="none">Sem comparação</option>
              <option value="prev">vs. mês anterior</option>
              <option value="year">vs. mesmo mês do ano anterior</option>
            </select>
          )}
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

      {TAB_REPORT[tab] && srv && !loading && (
        <div className="card overflow-hidden">
          <div className="bg-maka-500/10 border-b border-ink-800 px-4 py-3">
            <h2 className="font-semibold">{srv.meta.title}</h2>
            <p className="text-[11px] text-ink-500">Calculado no servidor · {srv.meta.start} a {srv.meta.end}{hasCmp ? ` · comparação ${srv.meta.cmp_start} a ${srv.meta.cmp_end}` : ""}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-ink-900/40 border-b border-ink-800 text-[10px] uppercase tracking-wider text-ink-500 font-bold">
            <div className="flex-1">Rubrica</div>
            <div className="w-28 text-right">Atual</div>
            {hasCmp && <div className="w-28 text-right">Anterior</div>}
            {hasCmp && <div className="w-28 text-right">Diferença</div>}
          </div>
          <div className="p-2">
            {srv.sections.map((sec, i) => (
              <div key={i} className="mb-1">
                <div className="px-3 py-1.5 bg-blue-500/10 text-blue-300 text-[11px] font-bold uppercase tracking-wide rounded">{sec.title}</div>
                {sec.lines.map((l, j) => <StmtRow key={j} l={l} variant="line" />)}
                {sec.subtotal && <StmtRow l={sec.subtotal} variant="sub" />}
              </div>
            ))}
            {srv.totals.map((tl, i) => <StmtRow key={i} l={tl} variant="total" />)}
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
              <BalRow label="Caixa e bancos" value={bal.totalBalance} />
              <BalRow label="Contas a receber (clientes)" value={bal.openReceivables} />
              <BalRow label="Total do ativo" value={bal.ativo} bold tone="pos" />
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-red-400 mb-3">Passivo</h3>
              <BalRow label="Contas a pagar (fornecedores)" value={bal.openPayables} />
              <BalRow label="Capital dos sócios (suprimentos)" value={bal.shareholderLoans} />
              <BalRow label="Impostos a entregar" value={bal.taxOwed} />
              <BalRow label="Total do passivo" value={bal.passivo} bold tone="neg" />
            </div>
          </div>
          <div className="card p-5">
            <div className={`flex justify-between py-3 px-4 rounded-lg ${bal.patrimonio >= 0 ? "bg-maka-500/10" : "bg-red-500/10"}`}>
              <span className="font-semibold">Património líquido (Ativo − Passivo)</span>
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
