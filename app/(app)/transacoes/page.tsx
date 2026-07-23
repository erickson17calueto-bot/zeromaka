"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, TX_INCOME_CATEGORIES, TX_EXPENSE_CATEGORIES, SUBCATEGORIES, Transaction } from "@/lib/data";
import { Plus, TrendingUp, TrendingDown, ArrowLeftRight, Landmark, X, Pencil, Trash2 } from "lucide-react";

export default function TransacoesPage() {
  const { transactions, accounts, addTransaction, editTransaction, deleteTransaction } = useStore();
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState(TX_EXPENSE_CATEGORIES[0]);
  const [sub, setSub] = useState("");
  const [accId, setAccId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const cats = txType === "income" ? TX_INCOME_CATEGORIES : TX_EXPENSE_CATEGORIES;
  const subs = SUBCATEGORIES[cat] || [];
  const list = useMemo(() => transactions.filter((t) => filter === "all" ? true : filter === "income" ? t.type === "income" : t.type === "expense"), [transactions, filter]);
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const editable = (t: Transaction) => t.type === "income" || t.type === "expense";

  const openNew = () => { setEditing(null); setTxType("expense"); setAmount(""); setDesc(""); setCat(TX_EXPENSE_CATEGORIES[0]); setSub(""); setAccId(accounts[0]?.id ?? ""); setDate(new Date().toISOString().slice(0, 10)); setShow(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setTxType(t.type as "income" | "expense"); setAmount(String(t.amount)); setDesc(t.description); setCat(t.category); setSub(t.subcategory || ""); setAccId(t.accountId); setDate(t.date); setShow(true); };

  const submit = () => {
    if (!amount || !desc.trim() || !accId) return;
    const payload = { accountId: accId, type: txType, amount: Number(amount), category: cat, subcategory: sub || undefined, description: desc.trim(), date };
    if (editing) editTransaction(editing.id, payload); else addTransaction(payload as Omit<Transaction, "id">);
    setShow(false);
  };

  const icon = (t: string) => t.startsWith("transfer") ? ArrowLeftRight : t.startsWith("capital") ? Landmark : t === "income" ? TrendingUp : TrendingDown;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div><h1 className="font-display text-2xl md:text-3xl tracking-tight">Transações</h1><p className="text-sm text-ink-400 mt-1">{transactions.length} lançamentos · as vendas registam-se em Faturas</p></div>
        <button onClick={openNew} className="btn-primary"><Plus size={15} /> Novo lançamento</button>
      </header>

      <div className="flex gap-2">
        {([["all", "Todos"], ["income", "Entradas"], ["expense", "Saídas"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${filter === v ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>{l}</button>
        ))}
      </div>

      <div className="card divide-y divide-ink-800">
        {list.map((t) => {
          const isIn = t.type === "income" || t.type === "transfer_in" || t.type === "capital_in";
          const special = t.type.startsWith("transfer") || t.type.startsWith("capital");
          const Icon = icon(t.type);
          return (
            <div key={t.id} className="p-4 flex items-center gap-3 group">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${special ? "bg-ink-800 text-ink-300" : isIn ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}><Icon size={16} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{t.description}</div>
                <div className="text-[11px] text-ink-500">{t.category}{t.subcategory ? ` · ${t.subcategory}` : ""} · {accName(t.accountId)} · {fmtDate(t.date)}</div>
              </div>
              <div className={`text-sm font-semibold ${special ? "text-ink-300" : isIn ? "text-emerald-400" : "text-red-400"}`}>{isIn ? "+" : "−"}{fmtKz(t.amount)}</div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {editable(t) && <button onClick={() => openEdit(t)} className="text-ink-500 hover:text-maka-400"><Pencil size={14} /></button>}
                <button onClick={() => deleteTransaction(t.id)} className="text-ink-500 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Sem lançamentos neste filtro.</div>}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5"><h3 className="font-display text-lg">{editing ? "Editar lançamento" : "Novo lançamento"}</h3><button onClick={() => setShow(false)} className="text-ink-400 hover:text-white"><X size={18} /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setTxType("income"); setCat(TX_INCOME_CATEGORIES[0]); setSub(""); }} className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${txType === "income" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-ink-700 text-ink-400"}`}>Entrada</button>
                <button onClick={() => { setTxType("expense"); setCat(TX_EXPENSE_CATEGORIES[0]); setSub(""); }} className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${txType === "expense" ? "border-red-500 bg-red-500/10 text-red-300" : "border-ink-700 text-ink-400"}`}>Saída</button>
              </div>
              <div><label className="label">Valor (Kz)</label><input className="input" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><label className="label">Descrição</label><input className="input" placeholder="Ex.: Compra de mercadoria" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Categoria</label><select className="input" value={cat} onChange={(e) => { setCat(e.target.value); setSub(""); }}>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label className="label">Subcategoria</label><select className="input" value={sub} onChange={(e) => setSub(e.target.value)} disabled={subs.length === 0}><option value="">{subs.length ? "— nenhuma —" : "n/a"}</option>{subs.map((s) => <option key={s}>{s}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Conta</label><select className="input" value={accId} onChange={(e) => setAccId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                <div><label className="label">Data</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <button onClick={submit} className="btn-primary w-full justify-center">{editing ? "Guardar alterações" : "Registar (+50 XP)"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
