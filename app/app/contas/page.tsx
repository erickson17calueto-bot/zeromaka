"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, AccountType, BANKS } from "@/lib/data";
import { Landmark, Smartphone, Banknote, Plus, ArrowLeftRight, X, Pencil, Trash2 } from "lucide-react";

const TYPES: { value: AccountType; label: string; hint: string; icon: any }[] = [
  { value: "bank", label: "Conta bancária", hint: "BAI, BFA, BIC, Standard Bank…", icon: Landmark },
  { value: "mobile_money", label: "Carteira móvel", hint: "Unitel Money, M-Pesa…", icon: Smartphone },
  { value: "cash", label: "Caixa físico", hint: "Dinheiro em mãos ou no cofre", icon: Banknote }
];

export default function ContasPage() {
  const { accounts, addAccount, editAccount, deleteAccount, transfer, organizations, orgId, updateAccountOpeningBalance } = useStore();
  const myRole = organizations.find(o => o.id === orgId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [showNew, setShowNew] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [bank, setBank] = useState(BANKS[0]);
  const [initial, setInitial] = useState("");
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [correctFor, setCorrectFor] = useState<string | null>(null);
  const [correctAmount, setCorrectAmount] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [correctErr, setCorrectErr] = useState("");

  const total = accounts.reduce((s, a) => s + a.currentBalance, 0);

  const today = new Date().toISOString().slice(0, 10);
  const submitNew = () => {
    if (!name.trim() || !initial) return;
    addAccount({ name: name.trim(), type, bank: type === "bank" ? bank : undefined, initialBalance: Number(initial), openingDate });
    setName(""); setInitial(""); setOpeningDate(today); setShowNew(false);
  };

  const openEdit = (id: string) => {
    const a = accounts.find((x) => x.id === id)!;
    setEditId(id); setName(a.name); setType(a.type); setBank(a.bank || BANKS[0]);
  };
  const submitEdit = () => {
    if (!editId || !name.trim()) return;
    editAccount(editId, { name: name.trim(), type, bank: type === "bank" ? bank : undefined });
    setEditId(null); setName("");
  };

  const openCorrect = (id: string) => {
    const a = accounts.find(x => x.id === id)!;
    setCorrectFor(id); setCorrectAmount(String(a.initialBalance)); setCorrectReason(""); setCorrectErr("");
  };
  const submitCorrect = async () => {
    if (!correctFor || !correctAmount || !correctReason.trim()) return;
    setCorrectErr("");
    const e = await updateAccountOpeningBalance(correctFor, Number(correctAmount), correctReason.trim());
    if (e) { setCorrectErr(e); return; }
    setCorrectFor(null);
  };

  const submitTransfer = () => {
    setErr("");
    const e = transfer(from, to, Number(amount));
    if (e) { setErr(e); return; }
    setFrom(""); setTo(""); setAmount(""); setShowTransfer(false);
  };

  const srcBalance = accounts.find((a) => a.id === from)?.currentBalance;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Contas e carteiras</h1>
          <p className="text-sm text-ink-400 mt-1">Total consolidado: <span className="text-maka-400 font-semibold">{fmtKz(total)}</span></p>
        </div>
        <div className="flex gap-2">
          {accounts.length >= 2 && <button onClick={() => setShowTransfer(true)} className="btn-ghost"><ArrowLeftRight size={15} /> Transferir</button>}
          <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={15} /> Nova conta</button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {accounts.length === 0 && <div className="card p-8 text-center text-sm text-ink-500 sm:col-span-2">Sem contas criadas. Clica em &quot;Nova conta&quot; para começar.</div>}
        {accounts.map((a) => {
          const T = TYPES.find((t) => t.value === a.type)!; const Icon = T.icon;
          return (
            <div key={a.id} className="card p-5 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-maka-500/10 border border-maka-500/30 flex items-center justify-center text-maka-400"><Icon size={18} /></div>
                  <div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-[11px] text-ink-500">{T.label}{a.bank ? ` · ${a.bank}` : ""}</div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(a.id)} className="text-ink-500 hover:text-maka-400"><Pencil size={15} /></button>
                  <button onClick={() => deleteAccount(a.id)} className="text-ink-500 hover:text-red-400"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Saldo atual</div>
                  <div className="font-display text-xl mt-0.5">{fmtKz(a.currentBalance)}</div>
                </div>
                {/* Rótulo informativo. `initialBalance` é legado e não entra em nenhum saldo — ver docs/005 */}
                <div className="text-right text-[11px] text-ink-500 flex items-center gap-1.5 justify-end">
                  Inicial: {fmtKz(a.initialBalance)}
                  {isAdmin && (
                    <button onClick={() => openCorrect(a.id)} className="text-ink-600 hover:text-maka-400" title="Corrigir saldo inicial (dono/administrador)">
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-ink-500">
        O saldo de uma conta só muda através de lançamentos (entrada, saída ou transferência) — nunca por edição direta. Transferências internas não contam como receita nem despesa nos relatórios.
      </p>

      {(showNew || editId) && (
        <Modal title={editId ? "Editar conta" : "Nova conta"} onClose={() => { setShowNew(false); setEditId(null); setName(""); setInitial(""); setOpeningDate(today); }}>
          <div className="space-y-4">
            <div>
              <label className="label">Nome da conta</label>
              <input className="input" placeholder="Ex.: BAI Empresa" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.value} onClick={() => setType(t.value)}
                      className={`rounded-lg border p-3 text-center transition-colors ${type === t.value ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
                      <Icon size={17} className="mx-auto" />
                      <div className="text-[11px] mt-1.5 font-medium">{t.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {type === "bank" && (
              <div>
                <label className="label">Banco</label>
                <select className="input" value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select>
              </div>
            )}
            {!editId && (
              <div>
                <label className="label">Saldo inicial (Kz)</label>
                <input className="input" type="number" placeholder="0" value={initial} onChange={(e) => setInitial(e.target.value)} />
              </div>
            )}
            {!editId && Number(initial) > 0 && (
              <div>
                <label className="label">Data desse saldo</label>
                <input className="input" type="date" max={today} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
                <p className="text-[11px] text-ink-500 mt-1">Data em que este valor era o saldo real da conta. Lançamentos entre essa data e hoje ajustam automaticamente o saldo atual.</p>
              </div>
            )}
            {editId && <p className="text-[11px] text-ink-500">O saldo não se edita aqui — só muda por lançamentos.</p>}
            <button onClick={editId ? submitEdit : submitNew} className="btn-primary w-full justify-center">{editId ? "Guardar alterações" : "Criar conta"}</button>
          </div>
        </Modal>
      )}

      {showTransfer && (
        <Modal title="Transferir dinheiro" onClose={() => setShowTransfer(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">De</label>
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Seleciona a origem</option>
                {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === to}>{a.name} — {fmtKz(a.currentBalance)}</option>)}
              </select>
              {srcBalance !== undefined && <p className="text-[11px] text-ink-500 mt-1">Disponível: {fmtKz(srcBalance)}</p>}
            </div>
            <div>
              <label className="label">Para</label>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Seleciona o destino</option>
                {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === from}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Valor (Kz)</label>
              <input className="input" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button onClick={submitTransfer} disabled={!from || !to || !amount} className="btn-primary w-full justify-center disabled:opacity-50">Transferir</button>
          </div>
        </Modal>
      )}

      {correctFor && (() => {
        const a = accounts.find(x => x.id === correctFor)!;
        return (
          <Modal title="Corrigir saldo inicial" onClose={() => setCorrectFor(null)}>
            <div className="space-y-4">
              <p className="text-[11px] text-amber-400 bg-amber-500/10 rounded-lg p-3">
                Ação restrita a donos/administradores da organização. Corrige o valor de abertura de <strong>{a.name}</strong> — usa só para corrigir um saldo inicial errado, não para ajustar o saldo atual (isso é sempre feito por lançamentos). Fica registado em auditoria.
              </p>
              <div>
                <label className="label">Novo saldo inicial (Kz)</label>
                <input className="input" type="number" value={correctAmount} onChange={(e) => setCorrectAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Motivo da correção</label>
                <input className="input" placeholder="Ex.: saldo de abertura foi lançado com o valor errado" value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} />
              </div>
              {correctErr && <p className="text-sm text-red-400">{correctErr}</p>}
              <button onClick={submitCorrect} disabled={!correctAmount || Number(correctAmount) <= 0 || !correctReason.trim()} className="btn-primary w-full justify-center disabled:opacity-40">Confirmar correção</button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
