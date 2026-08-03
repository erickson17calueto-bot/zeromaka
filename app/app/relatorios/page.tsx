"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, REGIMES } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { REPORT_RPC, StatementResult, StmtLine, DrillResult, LedgerResult } from "@/lib/reports/types";
import { FileBarChart, TrendingUp, Scale, Receipt, Download, Loader2, FileSpreadsheet, AlertTriangle, CalendarClock, Search, X, CheckCircle2, BookOpen, Package, SlidersHorizontal } from "lucide-react";

type Tab = "dre" | "dfc" | "impostos" | "aging" | "extrato" | "balanco";
type Cmp = "none" | "prev" | "year";
// extrato e balanço não usam a forma secções/totais — têm renderização própria
const TAB_REPORT: Record<Tab, keyof typeof REPORT_RPC | null> = {
  dre: "income_statement", dfc: "cash_flow_statement", impostos: "tax_control",
  aging: "aging", extrato: null, balanco: null,
};
const pad = (n: number) => String(n).padStart(2, "0");
// Demonstração formal: linhas presentes mostram sempre o valor (incl. 0 Kz).
// Só as células de comparação genuinamente inexistentes (null) ficam com "—".
const money = (v: number) => fmtKz(v);

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function RelatoriosPage() {
  const { obligations, accounts, transactions, contacts, company, orgId } = useStore();
  const [tab, setTab] = useState<Tab>("dre");
  const [period, setPeriod] = useState<"month" | "all" | "custom">("month");
  const [cmp, setCmp] = useState<Cmp>("none");
  const [srv, setSrv] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  // Intervalo livre + filtros por conta, categoria e contacto
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [fAccount, setFAccount] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fContact, setFContact] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const now = new Date();
  const periodDates = useCallback(() => {
    if (period === "custom" && customStart && customEnd) return { start: customStart, end: customEnd };
    if (period === "all") return { start: "2000-01-01", end: new Date().toISOString().slice(0, 10) };
    const y = now.getFullYear(), m = now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
  }, [period, customStart, customEnd]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const args: any = { p_org_id: orgId, p_start: start, p_end: end };
    // Só o Resultado de Caixa aceita filtros por conta/categoria/contacto
    if (reportType === "income_statement" || reportType === "aging") {
      args.p_cmp_start = c?.start ?? null;
      args.p_cmp_end = c?.end ?? null;
    }
    if (reportType === "income_statement") {
      args.p_include_reversed = false;
      args.p_account_id = fAccount || null;
      args.p_category = fCategory || null;
      args.p_contact_id = fContact || null;
    }
    createClient().rpc(REPORT_RPC[reportType], args).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setErr(error.message); else setSrv(data as StatementResult);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, period, cmp, orgId, periodDates, cmpDates, fAccount, fCategory, fContact]);

  // Pacote financeiro: todas as demonstrações + extratos num só PDF
  const [packing, setPacking] = useState(false);
  const exportPack = async () => {
    if (!orgId) return;
    setPacking(true);
    try {
      const { start, end } = periodDates();
      const c = cmpDates();
      const res = await fetch("/api/reports/export/pack", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId, startDate: start, endDate: end,
          cmpStartDate: c?.start ?? null, cmpEndDate: c?.end ?? null, includeLedgers: true,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert("Erro no pacote: " + (e.error || res.status)); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "pacote-financeiro.pdf";
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } finally { setPacking(false); }
  };

  const exportFile = async (format: "pdf" | "xlsx") => {
    // o extrato não está no mapa TAB_REPORT (tem forma própria), por isso é tratado à parte
    const reportType = tab === "extrato" ? "account_ledger" : TAB_REPORT[tab];
    if (!reportType || !orgId) return;
    if (reportType === "account_ledger" && !ledgerAcc) return;
    setExporting(format);
    try {
      const { start, end } = periodDates();
      const c = cmpDates();
      const res = await fetch(`/api/reports/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType, organizationId: orgId, startDate: start, endDate: end,
          cmpStartDate: c?.start ?? null, cmpEndDate: c?.end ?? null,
          accountId: reportType === "account_ledger" ? ledgerAcc : null,
          // o ficheiro exportado tem de refletir o que está no ecrã
          ...(reportType === "income_statement"
            ? { filterAccountId: fAccount || null, filterCategory: fCategory || null, filterContactId: fContact || null }
            : {}),
        }),
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
    { id: "extrato" as Tab, label: "Extrato de conta", icon: BookOpen },
    { id: "balanco" as Tab, label: "Balanço (gestão)", icon: Scale },
  ];

  const hasCmp = !!srv?.meta?.has_comparison;
  const warnings: string[] = srv?.meta?.warnings || [];
  const nFilters = [fAccount, fCategory, fContact].filter(Boolean).length;
  const clearFilters = () => { setFAccount(""); setFCategory(""); setFContact(""); };

  // Categorias vindas dos lançamentos, não do relatório: se as tirássemos do
  // relatório, ao filtrar a lista colapsava para a categoria escolhida e o
  // utilizador ficava sem forma de trocar.
  const categoriaOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) if (t.category) set.add(t.category);
    return Array.from(set).sort();
  }, [transactions]);

  // ---- Extrato de conta ----
  const [ledgerAcc, setLedgerAcc] = useState<string>("");
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerErr, setLedgerErr] = useState<string | null>(null);

  // escolhe a primeira conta assim que se abre o separador
  useEffect(() => {
    if (tab === "extrato" && !ledgerAcc && accounts.length > 0) setLedgerAcc(accounts[0].id);
  }, [tab, ledgerAcc, accounts]);

  useEffect(() => {
    if (tab !== "extrato" || !orgId || !ledgerAcc) { setLedger(null); return; }
    let cancelled = false;
    setLedgerLoading(true); setLedgerErr(null);
    const { start, end } = periodDates();
    createClient().rpc("report_account_ledger", {
      p_org_id: orgId, p_start: start, p_end: end, p_account_id: ledgerAcc,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setLedgerErr(error.message); else setLedger(data as LedgerResult);
      setLedgerLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab, orgId, ledgerAcc, period, periodDates]);

  // ---- Detalhe da linha (drill-down) ----
  const [drill, setDrill] = useState<{ line: StmtLine; data: DrillResult | null; loading: boolean; err: string | null } | null>(null);

  const openDrill = async (line: StmtLine) => {
    const reportType = TAB_REPORT[tab];
    if (!reportType || !orgId || !line.key) return;
    setDrill({ line, data: null, loading: true, err: null });
    const { start, end } = periodDates();
    const { data, error } = await createClient().rpc("report_drilldown", {
      p_org_id: orgId, p_report: reportType, p_key: line.key, p_start: start, p_end: end,
    });
    setDrill(d => d && d.line.key === line.key
      ? { ...d, loading: false, data: (data as DrillResult) ?? null, err: error?.message ?? null }
      : d);
  };

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
  const StmtRow = ({ l, variant }: { l: StmtLine; variant: "line" | "sub" | "total" }) => {
    const base = `flex items-center gap-2 px-3 ${variant === "total" ? "py-3 mt-2 rounded-lg bg-emerald-500/10 font-semibold" : variant === "sub" ? "py-2 bg-maka-500/5 font-semibold border-t border-ink-700" : "py-1.5 border-b border-ink-800/50"}`;
    const body = (
      <>
        <div className={`flex-1 flex items-center gap-1.5 ${variant === "total" ? "text-base" : "text-sm"}`}>
          {l.label}
          {l.key && <Search size={11} className="text-ink-600 shrink-0" />}
        </div>
        {numCell(l.current)}
        {hasCmp && numCell(l.comparison, true)}
        {hasCmp && numCell(l.difference)}
      </>
    );
    // Só as linhas com chave abrem detalhe — e só quando têm valor.
    if (!l.key || l.current === 0) return <div className={base}>{body}</div>;
    return (
      <button onClick={() => openDrill(l)}
        title={`Ver os documentos que compõem "${l.label}"`}
        className={`${base} w-full text-left hover:bg-maka-500/10 transition-colors cursor-pointer`}>
        {body}
      </button>
    );
  };

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
            <button onClick={() => setPeriod("custom")} className={`px-3 py-1 text-[12px] rounded ${period === "custom" ? "bg-maka-500 text-onbrand font-semibold" : "text-ink-400"}`}>Datas livres</button>
          </div>
          {tab === "dre" && (
            <button onClick={() => setShowFilters(v => !v)}
              className={`btn-ghost text-sm px-3 py-1.5 ${nFilters > 0 ? "border-maka-500/50 text-maka-400" : ""}`}
              title="Filtrar por conta, categoria ou contacto">
              <SlidersHorizontal size={14} /> Filtros{nFilters > 0 ? ` (${nFilters})` : ""}
            </button>
          )}
          {TAB_REPORT[tab] && period === "month" && (
            <select value={cmp} onChange={(e) => setCmp(e.target.value as Cmp)} className="input text-[12px] py-1.5 w-auto">
              <option value="none">Sem comparação</option>
              <option value="prev">vs. mês anterior</option>
              <option value="year">vs. mesmo mês do ano anterior</option>
            </select>
          )}
          {(TAB_REPORT[tab] || tab === "extrato") && (
            <>
              <button onClick={() => exportFile("pdf")} disabled={!!exporting || (tab === "extrato" && !ledger)} className="btn-ghost text-sm px-3 py-1.5 disabled:opacity-50" title="Exportar PDF (servidor)">
                {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
              </button>
              <button onClick={() => exportFile("xlsx")} disabled={!!exporting || (tab === "extrato" && !ledger)} className="btn-ghost text-sm px-3 py-1.5 disabled:opacity-50" title="Exportar Excel (servidor)">
                {exporting === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
              </button>
            </>
          )}
          <button onClick={exportPack} disabled={packing}
            className="btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
            title="Todas as demonstrações e extratos num só PDF, para o contabilista ou o banco">
            {packing ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />} Pacote financeiro
          </button>
        </div>
      </header>

      {period === "custom" && (
        <div className="card p-4 flex items-end gap-3 flex-wrap pop">
          <div>
            <label className="label">De</label>
            <input type="date" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
          {customStart && customEnd && customStart > customEnd && (
            <p className="text-[12px] text-red-400 pb-2">A data inicial é posterior à final.</p>
          )}
          {(!customStart || !customEnd) && (
            <p className="text-[12px] text-ink-500 pb-2">Escolhe as duas datas para o relatório mudar.</p>
          )}
        </div>
      )}

      {tab === "dre" && showFilters && (
        <div className="card p-4 pop">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="min-w-[180px]">
              <label className="label">Conta</label>
              <select className="input" value={fAccount} onChange={e => setFAccount(e.target.value)}>
                <option value="">Todas as contas</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="label">Categoria</label>
              <select className="input" value={fCategory} onChange={e => setFCategory(e.target.value)}>
                <option value="">Todas as categorias</option>
                {categoriaOpcoes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="label">Contacto</label>
              <select className="input" value={fContact} onChange={e => setFContact(e.target.value)}>
                <option value="">Todos os contactos</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {nFilters > 0 && (
              <button onClick={clearFilters} className="btn-ghost text-xs px-3 py-2">
                <X size={13} /> Limpar filtros
              </button>
            )}
          </div>
          {nFilters > 0 && (
            <p className="text-[12px] text-amber-400 mt-3 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Relatório filtrado: os totais abaixo referem-se só ao subconjunto escolhido,
              não ao resultado completo do período.
            </p>
          )}
        </div>
      )}

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

      {/* ---------- Extrato de conta ---------- */}
      {tab === "extrato" && (
        <div className="space-y-4">
          <div className="card p-4 flex items-end gap-3 flex-wrap">
            <div className="min-w-[220px]">
              <label className="label">Conta</label>
              <select value={ledgerAcc} onChange={e => setLedgerAcc(e.target.value)} className="input">
                {accounts.length === 0 && <option value="">Sem contas criadas</option>}
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {ledger && (
              <p className="text-[12px] text-ink-500 pb-2">
                Calculado no servidor · {ledger.meta.start} a {ledger.meta.end}
              </p>
            )}
          </div>

          {ledgerLoading && (
            <div className="card p-10 flex items-center justify-center gap-2 text-sm text-ink-500">
              <Loader2 size={15} className="animate-spin" /> A montar o extrato…
            </div>
          )}
          {ledgerErr && <div className="card p-4 text-sm text-red-400">{ledgerErr}</div>}

          {ledger && !ledgerLoading && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
                <div className="card p-4">
                  <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Saldo inicial</div>
                  <div className="mt-1.5 font-display text-xl">{fmtKz(ledger.opening)}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Entradas</div>
                  <div className="mt-1.5 font-display text-xl text-emerald-400">{fmtKz(ledger.inflow)}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Saídas</div>
                  <div className="mt-1.5 font-display text-xl text-red-400">{fmtKz(ledger.outflow)}</div>
                </div>
                <div className="card p-4 border-maka-500/40 bg-maka-500/[0.06]">
                  <div className="text-[11px] uppercase tracking-wider text-maka-400 font-bold">Saldo final</div>
                  <div className="mt-1.5 font-display text-xl text-maka-400">{fmtKz(ledger.closing)}</div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="bg-maka-500/10 px-4 py-3 border-b border-ink-800">
                  <h2 className="font-semibold">Extrato de Conta · {ledger.account.name}</h2>
                  <p className="text-[12px] text-ink-500 mt-0.5">
                    Cada linha mostra o saldo depois do movimento, como no extrato do banco.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="bg-ink-800/60 text-[10px] uppercase tracking-wider text-ink-400">
                        <th className="text-left font-bold px-4 py-2">Data</th>
                        <th className="text-left font-bold px-2 py-2">Documento</th>
                        <th className="text-left font-bold px-2 py-2">Contacto</th>
                        <th className="text-right font-bold px-2 py-2">Entrada</th>
                        <th className="text-right font-bold px-2 py-2">Saída</th>
                        <th className="text-right font-bold px-4 py-2">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-ink-800 bg-ink-800/20">
                        <td className="px-4 py-2 text-ink-400" colSpan={5}>Saldo inicial em {ledger.meta.start}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">{fmtKz(ledger.opening)}</td>
                      </tr>
                      {ledger.rows.map((r, i) => {
                        const anulado = r.estado === "reversed" || r.tipo === "reversal";
                        return (
                          <tr key={i} className={`border-b border-ink-800/60 ${anulado ? "opacity-60" : ""}`}>
                            <td className="px-4 py-2 text-ink-400 whitespace-nowrap">{fmtDate(r.data)}</td>
                            <td className="px-2 py-2">
                              <div className={`truncate max-w-[240px] ${r.estado === "reversed" ? "line-through" : ""}`}>{r.descricao}</div>
                              <div className="text-[11px] text-ink-500">
                                {r.numero}
                                {r.estado === "reversed" && <span className="text-amber-400"> · estornado</span>}
                                {r.tipo === "reversal" && <span className="text-amber-400"> · estorno</span>}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-ink-400 truncate max-w-[140px]">{r.contacto}</td>
                            <td className="px-2 py-2 text-right font-mono text-emerald-400 whitespace-nowrap">{r.entrada ? fmtKz(r.entrada) : "—"}</td>
                            <td className="px-2 py-2 text-right font-mono text-red-400 whitespace-nowrap">{r.saida ? fmtKz(r.saida) : "—"}</td>
                            <td className="px-4 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtKz(r.saldo)}</td>
                          </tr>
                        );
                      })}
                      {ledger.rows.length === 0 && (
                        <tr><td colSpan={6} className="text-center text-ink-500 py-8">Sem movimentos neste período.</td></tr>
                      )}
                      <tr className="bg-emerald-500/10 font-semibold">
                        <td className="px-4 py-3" colSpan={3}>Saldo final em {ledger.meta.end}</td>
                        <td className="px-2 py-3 text-right font-mono text-emerald-400">{fmtKz(ledger.inflow)}</td>
                        <td className="px-2 py-3 text-right font-mono text-red-400">{fmtKz(ledger.outflow)}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtKz(ledger.closing)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* prova de que o extrato fecha */}
              <div className="card p-4">
                <div className="flex items-center gap-1.5 text-[12px] font-medium">
                  {Math.abs((ledger.opening + ledger.inflow - ledger.outflow) - ledger.closing) < 0.005 ? (
                    <><CheckCircle2 size={13} className="text-emerald-400" />
                      <span className="text-emerald-400">O extrato fecha:</span>
                      <span className="text-ink-400">
                        {fmtKz(ledger.opening)} + {fmtKz(ledger.inflow)} − {fmtKz(ledger.outflow)} = {fmtKz(ledger.closing)}
                      </span></>
                  ) : (
                    <><AlertTriangle size={13} className="text-amber-400" />
                      <span className="text-amber-400">O extrato não fecha — verifica os movimentos.</span></>
                  )}
                </div>
              </div>

              {(ledger.meta.warnings || []).length > 0 && (
                <div className="card p-4 text-[11px] text-ink-500 space-y-1">
                  <div className="font-semibold text-ink-400">Notas metodológicas</div>
                  {ledger.meta.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                </div>
              )}
            </>
          )}
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

      {/* ---------- Detalhe da linha: de onde vem este número ---------- */}
      {drill && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="card max-w-2xl w-full p-6 max-h-[85vh] flex flex-col pop" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-lg leading-tight">{drill.line.label}</h3>
                <p className="text-[12px] text-ink-500 mt-1">
                  Documentos que compõem este valor · {periodDates().start} a {periodDates().end}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="text-ink-500 hover:text-ink-300 shrink-0"><X size={18} /></button>
            </div>

            {drill.loading && (
              <div className="flex items-center gap-2 text-sm text-ink-500 py-10 justify-center">
                <Loader2 size={15} className="animate-spin" /> A procurar os documentos…
              </div>
            )}
            {drill.err && <p className="text-sm text-red-400 py-6">{drill.err}</p>}

            {drill.data && !drill.loading && (
              <>
                <div className="mt-4 overflow-y-auto flex-1 -mx-1 px-1">
                  {drill.data.rows.length === 0 ? (
                    <p className="text-sm text-ink-500 text-center py-8">Sem documentos neste período.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-ink-900">
                        <tr className="text-[10px] uppercase tracking-wider text-ink-500">
                          <th className="text-left font-bold py-2">Data</th>
                          <th className="text-left font-bold py-2">Documento</th>
                          <th className="text-left font-bold py-2">Contacto</th>
                          <th className="text-right font-bold py-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drill.data.rows.map((r, i) => (
                          <tr key={i} className="border-b border-ink-800/60">
                            <td className="py-2 text-ink-400 whitespace-nowrap">{fmtDate(r.data)}</td>
                            <td className="py-2">
                              <div className="truncate max-w-[220px]">{r.descricao}</div>
                              <div className="text-[11px] text-ink-500">
                                {r.numero}
                                {typeof r.dias === "number" && (
                                  <span className={r.dias > 0 ? "text-red-400" : "text-emerald-400"}>
                                    {" · "}{r.dias > 0 ? `${r.dias}d em atraso` : "em dia"}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 text-ink-400 truncate max-w-[140px]">{r.contacto}</td>
                            <td className="py-2 text-right font-mono whitespace-nowrap">{fmtKz(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Prova de que o detalhe bate certo com o relatório */}
                <div className="mt-4 pt-3 border-t border-ink-700 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-400">Soma dos {drill.data.rows.length} documento{drill.data.rows.length !== 1 ? "s" : ""}</span>
                    <span className="font-mono font-semibold">{fmtKz(drill.data.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-400">Valor no relatório</span>
                    <span className="font-mono font-semibold">{fmtKz(Math.abs(drill.line.current))}</span>
                  </div>
                  {Math.abs(Math.abs(drill.line.current) - drill.data.total) < 0.005 ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-medium pt-1">
                      <CheckCircle2 size={13} /> Os valores conferem.
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[12px] text-amber-400 font-medium pt-1">
                      <AlertTriangle size={13} /> Diferença de {fmtKz(Math.abs(Math.abs(drill.line.current) - drill.data.total))} — verifica documentos estornados ou fora do período.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
