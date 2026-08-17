"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { fmtDate, fmtKz, JournalEntry } from "@/lib/data";

type Budget = { id: string; name: string; direction: "income" | "expense"; category_id?: string; account_id?: string; period_start: string; period_end: string; planned_amount: number; note?: string };
type ForecastDay = { day: string; actual_inflows: number; actual_outflows: number; scheduled_inflows: number; scheduled_outflows: number };
type Forecast = { opening_balance: number; actual_inflows: number; actual_outflows: number; scheduled_inflows: number; scheduled_outflows: number; receivables_due: number; payables_due: number; projected_closing_balance: number; daily: ForecastDay[] };

const isoToday = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const monthEnd = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().slice(0, 10); };
const amountForEntry = (entry: JournalEntry, budget: Budget) => {
  if (entry.status !== "posted" || entry.transactionDate < budget.period_start || entry.transactionDate > budget.period_end) return 0;
  if (budget.category_id && entry.categoryId !== budget.category_id) return 0;
  const line = entry.lines.find(l => (!budget.account_id || l.accountId === budget.account_id) && ((budget.direction === "income" && l.direction === "debit") || (budget.direction === "expense" && l.direction === "credit")));
  return line?.amount || 0;
};

export default function PlaneamentoPage() {
  const { orgId, accounts, categories, journalEntries } = useStore();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(monthEnd());
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    if (!orgId || !start || !end) return;
    setLoading(true); setMessage("");
    const [budgetResult, forecastResult] = await Promise.all([
      supabase.from("cash_budgets").select("*").eq("organization_id", orgId).order("period_start", { ascending: true }),
      supabase.rpc("get_cash_forecast", { p_org_id: orgId, p_start: start, p_end: end, p_account_id: accountId || null }),
    ]);
    if (budgetResult.data) setBudgets(budgetResult.data.map(b => ({ ...b, planned_amount: Number(b.planned_amount) })));
    if (forecastResult.data) setForecast(forecastResult.data as Forecast);
    if (budgetResult.error || forecastResult.error) setMessage((budgetResult.error || forecastResult.error)?.message || "Não foi possível carregar o planeamento.");
    setLoading(false);
  }, [accountId, end, orgId, start, supabase]);
  useEffect(() => { load(); }, [load]);

  const visibleBudgets = useMemo(() => budgets.filter(b => b.period_start <= end && b.period_end >= start && (!accountId || !b.account_id || b.account_id === accountId)), [accountId, budgets, end, start]);
  const totalIncomeBudget = visibleBudgets.filter(b => b.direction === "income").reduce((s, b) => s + b.planned_amount, 0);
  const totalExpenseBudget = visibleBudgets.filter(b => b.direction === "expense").reduce((s, b) => s + b.planned_amount, 0);
  const filteredCategories = categories.filter(c => c.categoryType === direction && c.isActive);

  const saveBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (!orgId || !name.trim() || !plannedAmount || Number(plannedAmount) < 0 || start > end) return;
    setSaving(true); setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("cash_budgets").insert({
      organization_id: orgId, created_by: user?.id, name: name.trim(), direction,
      category_id: categoryId || null, account_id: accountId || null,
      period_start: start, period_end: end, planned_amount: Number(plannedAmount), note: note.trim() || null,
    });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setName(""); setPlannedAmount(""); setNote(""); setCategoryId("");
    await load();
  };
  const removeBudget = async (id: string) => {
    const { error } = await supabase.from("cash_budgets").delete().eq("id", id);
    if (error) setMessage(error.message); else await load();
  };

  const maxDaily = Math.max(1, ...(forecast?.daily || []).map(d => Math.max(d.actual_inflows + d.scheduled_inflows, d.actual_outflows + d.scheduled_outflows)));

  return <div className="max-w-6xl mx-auto space-y-6">
    <header className="flex items-end justify-between flex-wrap gap-3"><div><div className="flex items-center gap-2 text-maka-400 text-sm font-semibold"><TrendingUp size={17} /> Decisão antecipada</div><h1 className="h-page mt-1">Previsão e orçamentos</h1><p className="text-sm text-ink-400 mt-1">Planeia o período, compara com o realizado e vê o saldo projetado.</p></div><button className="btn-ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar</button></header>

    <section className="card p-4"><div className="flex items-center gap-2 font-semibold mb-3"><CalendarRange size={16} className="text-maka-400" /> Período da previsão</div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"><div><label className="label">De</label><input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></div><div><label className="label">Até</label><input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div><div><label className="label">Conta</label><select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Todas as contas</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div>{message && <p className="text-sm text-red-400 mt-3">{message}</p>}</section>

    {forecast && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><div className="card p-4"><div className="text-[12.5px] text-ink-400 font-medium">Saldo inicial</div><div className="text-2xl font-semibold tracking-tight tabular-nums mt-1">{fmtKz(forecast.opening_balance)}</div></div><div className="card p-4"><div className="text-[12.5px] text-ink-400 font-medium">Entradas projetadas</div><div className="text-2xl font-semibold tracking-tight tabular-nums mt-1 text-emerald-400">{fmtKz(forecast.actual_inflows + forecast.scheduled_inflows + forecast.receivables_due)}</div><div className="text-[11px] text-ink-500 mt-1">Real + recorrente + a receber</div></div><div className="card p-4"><div className="text-[12.5px] text-ink-400 font-medium">Saídas projetadas</div><div className="text-2xl font-semibold tracking-tight tabular-nums mt-1 text-red-400">{fmtKz(forecast.actual_outflows + forecast.scheduled_outflows + forecast.payables_due)}</div><div className="text-[11px] text-ink-500 mt-1">Real + recorrente + a pagar</div></div><div className="card p-4"><div className="text-[12.5px] text-ink-400 font-medium">Fecho projetado</div><div className={`text-2xl font-semibold tracking-tight tabular-nums mt-1 ${forecast.projected_closing_balance >= 0 ? "text-maka-400" : "text-red-400"}`}>{fmtKz(forecast.projected_closing_balance)}</div></div></div>}

    <div className="grid grid-cols-1 xl:grid-cols-[350px_1fr] gap-5 items-start"><form onSubmit={saveBudget} className="card p-5 space-y-4"><div className="flex items-center gap-2 font-semibold"><Plus size={16} className="text-maka-400" /> Novo orçamento</div><div><label className="label">Nome</label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Marketing mensal" required /></div><div className="grid grid-cols-2 gap-2"><button type="button" className={`rounded-lg border px-3 py-2 text-sm ${direction === "expense" ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-ink-800 text-ink-400"}`} onClick={() => { setDirection("expense"); setCategoryId(""); }}>Despesa</button><button type="button" className={`rounded-lg border px-3 py-2 text-sm ${direction === "income" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-ink-800 text-ink-400"}`} onClick={() => { setDirection("income"); setCategoryId(""); }}>Receita</button></div><div><label className="label">Limite planeado</label><input className="input" type="number" min="0" step="0.01" value={plannedAmount} onChange={e => setPlannedAmount(e.target.value)} required /></div><div><label className="label">Categoria (opcional)</label><select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Todas as categorias</option>{filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="label">Conta (opcional)</label><select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Todas as contas</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className="label">Nota</label><textarea className="input min-h-20" value={note} onChange={e => setNote(e.target.value)} placeholder="Contexto ou objetivo" /></div><button className="btn-primary w-full" disabled={saving}>{saving ? "A guardar…" : "Criar orçamento"}</button></form>

      <section className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="card p-4"><div className="text-[12.5px] text-ink-400 font-medium">Orçamento de receitas</div><div className="text-2xl font-semibold tracking-tight tabular-nums text-emerald-400 mt-1">{fmtKz(totalIncomeBudget)}</div></div><div className="card p-4"><div className="text-[12.5px] text-ink-400 font-medium">Orçamento de despesas</div><div className="text-2xl font-semibold tracking-tight tabular-nums text-red-400 mt-1">{fmtKz(totalExpenseBudget)}</div></div></div>{visibleBudgets.length === 0 ? <div className="card p-8 text-center text-sm text-ink-500">Ainda não há orçamentos neste período.</div> : visibleBudgets.map(b => { const actual = journalEntries.reduce((s, e) => s + amountForEntry(e, b), 0); const pct = b.planned_amount ? Math.min(100, actual / b.planned_amount * 100) : 0; const category = categories.find(c => c.id === b.category_id); const account = accounts.find(a => a.id === b.account_id); return <div key={b.id} className="card p-4"><div className="flex justify-between gap-3"><div><div className="font-semibold">{b.name}</div><div className="text-xs text-ink-500 mt-1">{fmtDate(b.period_start)} – {fmtDate(b.period_end)} · {category?.name || "Todas as categorias"}{account ? ` · ${account.name}` : ""}</div></div><button className="text-ink-500 hover:text-red-400" onClick={() => removeBudget(b.id)} title="Apagar orçamento"><Trash2 size={15} /></button></div><div className="mt-3 flex justify-between text-xs"><span>Realizado: <b>{fmtKz(actual)}</b></span><span>Planeado: <b>{fmtKz(b.planned_amount)}</b></span></div><div className="h-2 rounded-full bg-ink-800 mt-2 overflow-hidden"><div className={`h-full rounded-full ${b.direction === "expense" && pct >= 90 ? "bg-red-500" : "bg-maka-500"}`} style={{ width: `${pct}%` }} /></div></div>; })}</section></div>

    {forecast?.daily?.length ? <section className="card p-5"><h2 className="font-semibold">Movimento diário projetado</h2><p className="text-xs text-ink-500 mt-1">As barras combinam movimentos reais e a próxima ocorrência programada.</p><div className="mt-5 space-y-2">{forecast.daily.slice(0, 31).map(day => { const inflow = day.actual_inflows + day.scheduled_inflows; const outflow = day.actual_outflows + day.scheduled_outflows; return <div key={day.day} className="grid grid-cols-[74px_1fr_90px] gap-3 items-center text-xs"><span className="text-ink-500">{fmtDate(day.day)}</span><div className="space-y-1"><div className="h-1.5 rounded-full bg-emerald-500/20 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${inflow / maxDaily * 100}%` }} /></div><div className="h-1.5 rounded-full bg-red-500/20 overflow-hidden"><div className="h-full bg-red-400" style={{ width: `${outflow / maxDaily * 100}%` }} /></div></div><span className="text-right text-ink-400">{inflow || outflow ? `${fmtKz(inflow - outflow)}` : "—"}</span></div>; })}</div></section> : null}
  </div>;
}