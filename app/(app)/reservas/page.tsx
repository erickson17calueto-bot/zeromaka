"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  fmtKz, fmtDate, FinancialReserve, ReserveType, ReservePriority,
  RESERVE_PRIORITY_LABEL, RESERVE_STATUS_LABEL,
} from "@/lib/data";
import { Plus, X, PiggyBank, TrendingUp, Unlock, Ban, Link2, ShieldAlert } from "lucide-react";

const PRIORITY_STYLE: Record<ReservePriority, string> = {
  critical: "bg-red-500/10 text-red-400",
  high: "bg-amber-500/10 text-amber-400",
  normal: "bg-ink-800 text-ink-300",
  low: "bg-ink-800 text-ink-500",
};

export default function ReservasPage() {
  const { reserves, reserveCategories, accounts, obligations, trueAvailable, finSettings,
    createReserve, increaseReserve, releaseReserve, cancelReserve, updateFinSettings } = useStore();

  const [bufferEdit, setBufferEdit] = useState(false);
  const [bufferVal, setBufferVal] = useState("");
  const saveBuffer = async () => {
    const err = await updateFinSettings({ minimumCashBuffer: Number(bufferVal) || 0 });
    if (!err) setBufferEdit(false);
  };

  const active = useMemo(() => reserves.filter(r => r.status === "active" || r.status === "partially_released"), [reserves]);
  const totalReserved = active.reduce((s, r) => s + r.reservedAmount, 0);
  const criticalReserved = active.filter(r => r.priority === "critical").reduce((s, r) => s + r.reservedAmount, 0);
  const payables = useMemo(() => obligations.filter(o => o.direction === "payable" && o.lifecycleStatus === "open" && o.outstandingAmount > 0), [obligations]);
  const catName = (id: string) => reserveCategories.find(c => c.id === id)?.name ?? "—";
  const accName = (id?: string) => id ? (accounts.find(a => a.id === id)?.name ?? "—") : null;
  const oblNumber = (id?: string) => id ? (obligations.find(o => o.id === id)?.internalNumber ?? "—") : null;

  const overReserved = trueAvailable ? totalReserved > trueAvailable.currentCashBalance : false;

  // ---- Create ----
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");
  const [type, setType] = useState<ReserveType>("general");
  const [accId, setAccId] = useState("");
  const [oblId, setOblId] = useState("");
  const [priority, setPriority] = useState<ReservePriority>("normal");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const openNew = () => {
    setName(""); setAmount(""); setCatId(reserveCategories[0]?.id ?? ""); setType("general");
    setAccId(accounts[0]?.id ?? ""); setOblId(payables[0]?.id ?? ""); setPriority("normal");
    setTargetAmount(""); setTargetDate(""); setShow(true);
  };
  const submit = async () => {
    if (!name.trim() || !amount || !catId) return;
    const err = await createReserve({
      categoryId: catId, name: name.trim(), amount: Number(amount), reserveType: type,
      accountId: type === "account_specific" ? accId : undefined,
      obligationId: type === "obligation_linked" ? oblId : undefined,
      priority, targetAmount: targetAmount ? Number(targetAmount) : undefined,
      targetDate: targetDate || undefined,
    });
    if (!err) setShow(false);
  };

  // ---- Actions ----
  const [action, setAction] = useState<{ kind: "increase" | "release" | "cancel"; reserve: FinancialReserve } | null>(null);
  const [actAmount, setActAmount] = useState("");
  const [actReason, setActReason] = useState("");
  const openAction = (kind: "increase" | "release" | "cancel", r: FinancialReserve) => {
    setAction({ kind, reserve: r }); setActAmount(kind === "release" ? String(r.reservedAmount) : ""); setActReason("");
  };
  const submitAction = async () => {
    if (!action) return;
    const { kind, reserve } = action;
    let err: string | null = null;
    if (kind === "increase") err = await increaseReserve(reserve.id, Number(actAmount), actReason || undefined);
    else if (kind === "release") err = await releaseReserve(reserve.id, Number(actAmount), actReason || "Sem motivo indicado");
    else err = await cancelReserve(reserve.id, actReason || "Sem motivo indicado");
    if (!err) setAction(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Reservas</h1>
          <p className="text-sm text-ink-400 mt-1">Reserva lógica de parte do saldo — não move dinheiro nem cria lançamentos.</p>
        </div>
        <button onClick={openNew} disabled={reserveCategories.length === 0} className="btn-primary disabled:opacity-40"><Plus size={15} /> Nova reserva</button>
      </header>

      {overReserved && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-4 flex gap-3 items-start">
          <ShieldAlert className="text-amber-400 shrink-0 mt-0.5" size={19} />
          <div className="text-sm text-ink-300">As reservas ({fmtKz(totalReserved)}) ultrapassam o saldo atual ({fmtKz(trueAvailable?.currentCashBalance ?? 0)}). Estás a planear necessidades acima do caixa disponível.</div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-xs text-ink-500 flex items-center gap-1"><PiggyBank size={13} /> Total reservado</div><div className="text-xl font-semibold mt-1">{fmtKz(totalReserved)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500 flex items-center gap-1"><ShieldAlert size={13} /> Reservas críticas</div><div className="text-xl font-semibold mt-1 text-red-400">{fmtKz(criticalReserved)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500">Reservas ativas</div><div className="text-xl font-semibold mt-1">{active.length}</div></div>
        <div className="card p-4">
          <div className="text-xs text-ink-500">Reserva mínima de caixa</div>
          {bufferEdit ? (
            <div className="mt-1 flex gap-1">
              <input className="input py-1 text-sm" type="number" value={bufferVal} onChange={e => setBufferVal(e.target.value)} autoFocus />
              <button onClick={saveBuffer} className="btn-primary px-2 py-1 text-xs">OK</button>
            </div>
          ) : (
            <button onClick={() => { setBufferVal(String(finSettings.minimumCashBuffer)); setBufferEdit(true); }} className="text-xl font-semibold mt-1 hover:text-maka-400 transition-colors">{fmtKz(finSettings.minimumCashBuffer)}</button>
          )}
        </div>
      </div>

      <div className="card divide-y divide-ink-800">
        {reserves.map(r => {
          const isActive = r.status === "active" || r.status === "partially_released";
          const pct = r.targetAmount ? Math.min(100, Math.round((r.reservedAmount / r.targetAmount) * 100)) : null;
          return (
            <div key={r.id} className={`p-4 group ${!isActive ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {r.name}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[r.priority]}`}>{RESERVE_PRIORITY_LABEL[r.priority]}</span>
                    {!isActive && <span className="text-[10px] text-ink-500 uppercase">{RESERVE_STATUS_LABEL[r.status]}</span>}
                  </div>
                  <div className="text-[11px] text-ink-500 flex items-center gap-1.5 flex-wrap">
                    {catName(r.categoryId)}
                    {r.reserveType === "account_specific" && <span>· conta {accName(r.accountId)}</span>}
                    {r.reserveType === "obligation_linked" && <span className="flex items-center gap-0.5"><Link2 size={10} /> {oblNumber(r.obligationId)}</span>}
                    {r.targetDate && <span>· alvo {fmtDate(r.targetDate)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{fmtKz(r.reservedAmount)}</div>
                  {r.targetAmount && <div className="text-[10px] text-ink-500">de {fmtKz(r.targetAmount)} · {pct}%</div>}
                </div>
                {isActive && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openAction("increase", r)} className="text-ink-500 hover:text-emerald-400" title="Aumentar"><TrendingUp size={15} /></button>
                    <button onClick={() => openAction("release", r)} className="text-ink-500 hover:text-amber-400" title="Libertar"><Unlock size={15} /></button>
                    <button onClick={() => openAction("cancel", r)} className="text-ink-500 hover:text-red-400" title="Cancelar"><Ban size={14} /></button>
                  </div>
                )}
              </div>
              {r.targetAmount && isActive && (
                <div className="mt-2 h-1.5 rounded-full bg-ink-800 overflow-hidden"><div className="h-full bg-maka-500" style={{ width: `${pct}%` }} /></div>
              )}
            </div>
          );
        })}
        {reserves.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Sem reservas. Cria a primeira para separar o dinheiro comprometido.</div>}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Nova reserva</h3>
              <button onClick={() => setShow(false)} className="text-ink-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div><label className="label">Nome</label><input className="input" placeholder="Ex.: Salários de julho" value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Valor (Kz)</label><input className="input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                <div><label className="label">Categoria</label><select className="input" value={catId} onChange={e => setCatId(e.target.value)}>{reserveCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={type} onChange={e => setType(e.target.value as ReserveType)}>
                  <option value="general">Geral (toda a organização)</option>
                  <option value="account_specific">Por conta</option>
                  <option value="obligation_linked">Ligada a conta a pagar</option>
                </select>
              </div>
              {type === "account_specific" && (
                <div><label className="label">Conta</label><select className="input" value={accId} onChange={e => setAccId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmtKz(a.currentBalance)}</option>)}</select></div>
              )}
              {type === "obligation_linked" && (
                <div>
                  <label className="label">Conta a pagar</label>
                  <select className="input" value={oblId} onChange={e => setOblId(e.target.value)}>
                    {payables.map(o => <option key={o.id} value={o.id}>{o.internalNumber} — {fmtKz(o.outstandingAmount)}</option>)}
                  </select>
                  {payables.length === 0 && <p className="text-[11px] text-amber-400 mt-1">Sem contas a pagar em aberto.</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Prioridade</label><select className="input" value={priority} onChange={e => setPriority(e.target.value as ReservePriority)}>{(["critical","high","normal","low"] as ReservePriority[]).map(p => <option key={p} value={p}>{RESERVE_PRIORITY_LABEL[p]}</option>)}</select></div>
                <div><label className="label">Data alvo (opcional)</label><input className="input" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></div>
              </div>
              <div><label className="label">Valor alvo (opcional)</label><input className="input" type="number" placeholder="0" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} /></div>
              <button onClick={submit} disabled={!name.trim() || !amount || !catId || (type === "obligation_linked" && !oblId)} className="btn-primary w-full justify-center disabled:opacity-40">Criar reserva</button>
            </div>
          </div>
        </div>
      )}

      {action && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <h3 className={`font-display text-lg mb-3 ${action.kind === "cancel" ? "text-red-400" : action.kind === "release" ? "text-amber-400" : "text-emerald-400"}`}>
              {action.kind === "increase" ? "Aumentar reserva" : action.kind === "release" ? "Libertar reserva" : "Cancelar reserva"}
            </h3>
            <p className="text-sm text-ink-300 mb-4">{action.reserve.name} — reservado {fmtKz(action.reserve.reservedAmount)}
              {action.reserve.priority === "critical" && <span className="text-red-400"> · crítica (só owner/admin)</span>}
            </p>
            <div className="space-y-4">
              {action.kind !== "cancel" && (
                <div>
                  <label className="label">Valor (Kz)</label>
                  <input className="input" type="number" value={actAmount} onChange={e => setActAmount(e.target.value)} />
                  {action.kind === "release" && <p className="text-[11px] text-ink-500 mt-1">Máximo {fmtKz(action.reserve.reservedAmount)}. Menos que o total = libertação parcial.</p>}
                </div>
              )}
              <div><label className="label">Motivo{action.kind !== "increase" ? "" : " (opcional)"}</label><input className="input" value={actReason} onChange={e => setActReason(e.target.value)} placeholder="Ex.: já não é necessário" /></div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAction(null)} className="btn-ghost">Cancelar</button>
                <button onClick={submitAction} className="btn-primary">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
