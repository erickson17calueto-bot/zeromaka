"use client";
import { FormEvent, useMemo, useState } from "react";
import { Pause, Play, Plus, RefreshCw, Repeat2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtDate, fmtKz } from "@/lib/data";

const today = () => new Date().toISOString().slice(0, 10);
const FREQUENCIES = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly", label: "Anual" },
] as const;

export default function RecorrenciasPage() {
  const {
    accounts, categories, contacts, recurringTransactions,
    createRecurringTransaction, setRecurringActive, generateDueRecurringTransactions,
  } = useStore();
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contactId, setContactId] = useState("");
  const [frequency, setFrequency] = useState<typeof FREQUENCIES[number]["value"]>("monthly");
  const [startDate, setStartDate] = useState(today());
  const [nextRunDate, setNextRunDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const filteredCategories = useMemo(
    () => categories.filter(c => c.categoryType === kind && c.isActive),
    [categories, kind]
  );
  const activeCount = recurringTransactions.filter(r => r.active).length;
  const dueCount = recurringTransactions.filter(r => r.active && r.nextRunDate <= today()).length;
  const monthlyEstimate = recurringTransactions.filter(r => r.active).reduce((sum, r) => {
    const factor = r.frequency === "weekly" ? 4.33 : r.frequency === "quarterly" ? 1 / 3 : r.frequency === "yearly" ? 1 / 12 : 1;
    return sum + r.amount * factor * (r.kind === "income" ? 1 : -1);
  }, 0);

  const resetForm = () => {
    setAmount(""); setDescription(""); setCategoryId(""); setContactId("");
    setStartDate(today()); setNextRunDate(today());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountId || !amount || Number(amount) <= 0 || !description.trim()) return;
    setSaving(true);
    const error = await createRecurringTransaction({
      accountId, kind, amount: Number(amount), description, categoryId: categoryId || undefined,
      contactId: contactId || undefined, frequency, startDate, nextRunDate, active: true,
    });
    setSaving(false);
    if (!error) resetForm();
  };

  const generate = async () => {
    setGenerating(true);
    await generateDueRecurringTransactions();
    setGenerating(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-maka-400 text-sm font-semibold"><Repeat2 size={17} /> Automação controlada</div>
          <h1 className="h-page mt-1">Recorrências</h1>
          <p className="text-sm text-ink-400 mt-1">Programas lançamentos repetitivos sem esconder o movimento no diário.</p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={generating || dueCount === 0}>
          <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
          {generating ? "A gerar…" : `Gerar vencidas${dueCount ? ` (${dueCount})` : ""}`}
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Ativas</div><div className="font-display text-2xl mt-1">{activeCount}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">A gerar</div><div className="font-display text-2xl mt-1 text-amber-400">{dueCount}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Estimativa líquida/mês</div><div className={`font-display text-2xl mt-1 ${monthlyEstimate >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtKz(monthlyEstimate)}</div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 items-start">
        <form onSubmit={submit} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold"><Plus size={16} className="text-maka-400" /> Nova recorrência</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setKind("expense")} className={`rounded-lg border px-3 py-2 text-sm ${kind === "expense" ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-ink-800 text-ink-400"}`}>Despesa</button>
            <button type="button" onClick={() => setKind("income")} className={`rounded-lg border px-3 py-2 text-sm ${kind === "income" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-ink-800 text-ink-400"}`}>Receita</button>
          </div>
          <div><label className="label">Conta</label><select className="input" value={accountId} onChange={e => setAccountId(e.target.value)} required><option value="">Escolhe a conta…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><label className="label">Descrição</label><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Renda do escritório" required /></div>
          <div><label className="label">Valor</label><input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" required /></div>
          <div><label className="label">Categoria</label><select className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Sem categoria</option>{filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label">Contacto (opcional)</label><select className="input" value={contactId} onChange={e => setContactId(e.target.value)}><option value="">Sem contacto</option>{contacts.filter(c => !c.isArchived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2"><div><label className="label">Frequência</label><select className="input" value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)}>{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div><div><label className="label">Próxima data</label><input className="input" type="date" value={nextRunDate} onChange={e => setNextRunDate(e.target.value)} required /></div></div>
          <div><label className="label">Data de início</label><input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></div>
          <button className="btn-primary w-full" disabled={saving}>{saving ? "A guardar…" : "Criar recorrência"}</button>
          <p className="text-[11px] text-ink-500">A geração é manual nesta primeira versão: só cria lançamentos quando clicares em “Gerar vencidas”.</p>
        </form>

        <section className="space-y-3">
          {recurringTransactions.length === 0 && <div className="card p-10 text-center text-sm text-ink-500">Ainda não há recorrências. Cria a primeira ao lado.</div>}
          {recurringTransactions.map(r => {
            const account = accounts.find(a => a.id === r.accountId);
            const category = categories.find(c => c.id === r.categoryId);
            const contact = contacts.find(c => c.id === r.contactId);
            const frequencyLabel = FREQUENCIES.find(f => f.value === r.frequency)?.label;
            return <div key={r.id} className={`card p-4 ${!r.active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-semibold truncate">{r.description}</div><div className="text-xs text-ink-500 mt-1">{account?.name || "Conta"} · {frequencyLabel} · {category?.name || "Sem categoria"}{contact ? ` · ${contact.name}` : ""}</div></div>
                <div className={`font-display text-lg whitespace-nowrap ${r.kind === "income" ? "text-emerald-400" : "text-red-400"}`}>{r.kind === "income" ? "+" : "−"}{fmtKz(r.amount)}</div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs"><div className={r.active && r.nextRunDate <= today() ? "text-amber-400" : "text-ink-500"}>{r.active ? `Próximo lançamento: ${fmtDate(r.nextRunDate)}` : "Pausada"}</div><button onClick={() => setRecurringActive(r.id, !r.active)} className="btn-ghost text-xs">{r.active ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Ativar</>}</button></div>
            </div>;
          })}
        </section>
      </div>
    </div>
  );
}