"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate } from "@/lib/data";
import { Plus, X, ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";

export default function CapitalPage() {
  const { transactions, accounts, contacts, addCapital } = useStore();
  const [show, setShow] = useState(false);
  const [kind, setKind] = useState<"aporte" | "retirada">("aporte");
  const [partnerId, setPartnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [accId, setAccId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");

  const socios = contacts.filter((c) => c.kind === "socio");
  const movements = useMemo(() => transactions.filter((t) => t.type === "capital_in" || t.type === "capital_out"), [transactions]);

  const balances = useMemo(() => socios.map((s) => {
    const inn = movements.filter((m) => m.partnerId === s.id && m.type === "capital_in").reduce((a, m) => a + m.amount, 0);
    const out = movements.filter((m) => m.partnerId === s.id && m.type === "capital_out").reduce((a, m) => a + m.amount, 0);
    return { ...s, contributed: inn, withdrawn: out, balance: inn - out };
  }), [socios, movements]);

  const totalInCompany = balances.reduce((s, b) => s + b.balance, 0);

  const submit = () => {
    setErr("");
    const p = socios.find((s) => s.id === partnerId);
    if (!p || !amount) { setErr("Escolhe o sócio e o valor"); return; }
    const e = addCapital({ partnerId, partnerName: p.name, kind, amount: Number(amount), accountId: accId, date, description: desc.trim() });
    if (e) { setErr(e); return; }
    setAmount(""); setDesc(""); setShow(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-page">Capital dos sócios</h1>
          <p className="text-sm text-ink-400 mt-1">Aportes e retiradas (suprimentos). Não contam como receita nem despesa.</p>
        </div>
        <button onClick={() => setShow(true)} className="btn-primary"><Plus size={15} /> Novo movimento</button>
      </header>

      <div className="card p-4 flex items-center justify-between border-maka-500/30">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Capital dos sócios na empresa</div>
          <div className="mt-1 font-display text-xl text-maka-400">{fmtKz(totalInCompany)}</div>
          <div className="text-[11px] text-ink-500 mt-0.5">É um passivo — dinheiro que a empresa deve aos sócios.</div>
        </div>
        <Landmark className="text-ink-600" size={28} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {balances.map((b) => (
          <div key={b.id} className="card p-4">
            <div className="font-semibold">{b.name}</div>
            <div className="text-[11px] text-ink-500">{b.notes || "Sócio"}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">Aportou</div>
                <div className="text-sm font-semibold text-emerald-400 mt-0.5">{fmtKz(b.contributed)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">Retirou</div>
                <div className="text-sm font-semibold text-red-400 mt-0.5">{fmtKz(b.withdrawn)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold">Saldo</div>
                <div className="text-sm font-semibold mt-0.5">{fmtKz(b.balance)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="p-4 border-b border-ink-800 font-semibold">Histórico de movimentos</div>
        <div className="divide-y divide-ink-800">
          {movements.map((m) => {
            const isIn = m.type === "capital_in";
            return (
              <div key={m.id} className="p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isIn ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {isIn ? <ArrowDownCircle size={17} /> : <ArrowUpCircle size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{m.partnerName} — {isIn ? "Aporte" : "Retirada"}</div>
                  <div className="text-[11px] text-ink-500">{m.description} · {fmtDate(m.date)}</div>
                </div>
                <div className={`text-sm font-semibold ${isIn ? "text-emerald-400" : "text-red-400"}`}>{isIn ? "+" : "−"}{fmtKz(m.amount)}</div>
              </div>
            );
          })}
          {movements.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Ainda sem movimentos de capital.</div>}
        </div>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Movimento de capital</h3>
              <button onClick={() => setShow(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setKind("aporte")} className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${kind === "aporte" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-ink-700 text-ink-400"}`}>Aporte (entra)</button>
                <button onClick={() => setKind("retirada")} className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${kind === "retirada" ? "border-red-500 bg-red-500/10 text-red-300" : "border-ink-700 text-ink-400"}`}>Retirada (sai)</button>
              </div>
              <div>
                <label className="label">Sócio</label>
                <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                  <option value="">Seleciona</option>
                  {socios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Valor (Kz)</label>
                  <input className="input" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <label className="label">{kind === "aporte" ? "Conta que recebe" : "Conta que paga"}</label>
                  <select className="input" value={accId} onChange={(e) => setAccId(e.target.value)}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Descrição (opcional)</label>
                <input className="input" placeholder="Ex.: empréstimo para stock inicial" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              {err && <p className="text-sm text-red-400">{err}</p>}
              <button onClick={submit} className="btn-primary w-full justify-center">Registar movimento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
