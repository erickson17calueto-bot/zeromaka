"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, Obligation, OBLIGATION_KIND_LABEL, ObligationDocumentKind } from "@/lib/data";
import { Plus, X, Wallet, HandCoins } from "lucide-react";

type LoanKind = "employee_loan" | "salary_advance";
const KIND_LABEL: Record<LoanKind, string> = { employee_loan: "Empréstimo", salary_advance: "Adiantamento salarial" };
const CATEGORY_NAME: Record<LoanKind, string> = { employee_loan: "Empréstimos a funcionários", salary_advance: "Adiantamentos salariais" };

export default function EmprestimosPage() {
  const { obligations, contacts, accounts, categories, grantEmployeeLoan, postSettlement } = useStore();

  const funcionarios = useMemo(
    () => contacts.filter(c => !c.isArchived && (c.kind === "funcionario" || c.kind === "ambos")),
    [contacts]
  );

  const loans = useMemo(
    () => obligations.filter(o => o.documentKind === "employee_loan" || o.documentKind === "salary_advance"),
    [obligations]
  );
  const [filter, setFilter] = useState<"all" | "open" | "paid">("open");
  const shown = useMemo(() => loans.filter(o => {
    if (filter === "open") return o.lifecycleStatus === "open" && o.outstandingAmount > 0;
    if (filter === "paid") return o.outstandingAmount <= 0;
    return true;
  }), [loans, filter]);

  const totals = useMemo(() => {
    const open = loans.filter(o => o.lifecycleStatus === "open");
    return { outstanding: open.reduce((s, o) => s + o.outstandingAmount, 0), count: open.length };
  }, [loans]);

  const contactName = (id: string) => contacts.find(c => c.id === id)?.name ?? "—";

  // ---- Conceder ----
  const [showNew, setShowNew] = useState(false);
  const [nContact, setNContact] = useState("");
  const [nKind, setNKind] = useState<LoanKind>("employee_loan");
  const [nAccount, setNAccount] = useState("");
  const [nAmount, setNAmount] = useState("");
  const [nDate, setNDate] = useState(new Date().toISOString().slice(0, 10));
  const [nDue, setNDue] = useState("");
  const [nCat, setNCat] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nDocNumber, setNDocNumber] = useState("");
  const [nNotes, setNNotes] = useState("");

  const defaultCategoryFor = (kind: LoanKind) => categories.find(c => c.name === CATEGORY_NAME[kind] && c.isActive)?.id || "";

  const openNew = () => {
    setNContact(funcionarios[0]?.id ?? ""); setNKind("employee_loan");
    setNAccount(accounts[0]?.id ?? ""); setNAmount("");
    setNDate(new Date().toISOString().slice(0, 10)); setNDue("");
    setNCat(defaultCategoryFor("employee_loan"));
    setNDesc(""); setNDocNumber(""); setNNotes("");
    setShowNew(true);
  };
  const changeKind = (kind: LoanKind) => { setNKind(kind); setNCat(defaultCategoryFor(kind)); };

  const submitNew = async () => {
    if (!nContact || !nAccount || !nAmount) return;
    const err = await grantEmployeeLoan({
      contactId: nContact, accountId: nAccount, amount: Number(nAmount), kind: nKind,
      date: nDate, dueDate: nDue || undefined, description: nDesc || undefined,
      categoryId: nCat || undefined, documentNumber: nDocNumber || undefined, notes: nNotes || undefined,
    });
    if (!err) setShowNew(false);
  };

  // ---- Devolução ----
  const [payFor, setPayFor] = useState<Obligation | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState("");
  const openPay = (o: Obligation) => {
    setPayFor(o); setPayAmount(String(o.outstandingAmount));
    setPayAccount(accounts[0]?.id ?? ""); setPayDate(new Date().toISOString().slice(0, 10)); setPayReference("");
  };
  const submitPay = async () => {
    if (!payFor || !payAccount || !payAmount) return;
    const err = await postSettlement({
      direction: "incoming", contactId: payFor.contactId, accountId: payAccount,
      allocations: [{ obligationId: payFor.id, amount: Number(payAmount) }],
      paymentDate: payDate, reference: payReference || undefined,
    });
    if (!err) setPayFor(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Empréstimos e adiantamentos</h1>
          <p className="text-sm text-ink-400 mt-1">
            {totals.count} em aberto · o dinheiro sai do caixa já na concessão — a devolução é acompanhada aqui.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary" disabled={!funcionarios.length}><Plus size={15} /> Novo empréstimo/adiantamento</button>
      </header>

      {!funcionarios.length && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-ink-300">
          Ainda não tens nenhum contacto do tipo <strong>Funcionário</strong>. Cria um em{" "}
          <Link href="/app/contactos" className="text-maka-400 underline">Contactos</Link> antes de conceder um empréstimo ou adiantamento.
        </section>
      )}

      <div className="card p-4">
        <div className="text-xs text-ink-500">Total em aberto</div>
        <div className="text-xl font-semibold mt-1">{fmtKz(totals.outstanding)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["open", "paid", "all"] as const).map(v => (
          <button key={v} onClick={() => setFilter(v)}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${filter === v ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
            {{ open: "Em aberto", paid: "Devolvidos", all: "Todos" }[v]}
          </button>
        ))}
      </div>

      <div className="card divide-y divide-ink-800">
        {shown.map(o => {
          const canPay = o.lifecycleStatus === "open" && o.outstandingAmount > 0;
          return (
            <div key={o.id} className="p-4 flex items-center gap-3 group">
              <div className="h-9 w-9 rounded-lg bg-maka-500/10 text-maka-400 flex items-center justify-center shrink-0"><HandCoins size={16} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {contactName(o.contactId)}
                  <span className="ml-2 text-[11px] text-ink-500">{o.internalNumber}</span>
                </div>
                <div className="text-[11px] text-ink-500">
                  {OBLIGATION_KIND_LABEL[o.documentKind as ObligationDocumentKind]} · concedido {fmtDate(o.issueDate)}
                  {o.dueDate && o.dueDate !== o.issueDate && ` · devolução prevista ${fmtDate(o.dueDate)}`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{fmtKz(o.outstandingAmount)}</div>
                {o.paidAmount > 0 && <div className="text-[10px] text-ink-500">devolvido {fmtKz(o.paidAmount)} de {fmtKz(o.originalAmount)}</div>}
              </div>
              {canPay && (
                <button onClick={() => openPay(o)} className="text-ink-500 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Registar devolução">
                  <Wallet size={16} />
                </button>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Nada para este filtro.</div>}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Novo empréstimo/adiantamento</h3>
              <button onClick={() => setShowNew(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => changeKind("employee_loan")}
                  className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${nKind === "employee_loan" ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400"}`}>
                  {KIND_LABEL.employee_loan}
                </button>
                <button onClick={() => changeKind("salary_advance")}
                  className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${nKind === "salary_advance" ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400"}`}>
                  {KIND_LABEL.salary_advance}
                </button>
              </div>
              <div>
                <label className="label">Funcionário</label>
                <select className="input" value={nContact} onChange={e => setNContact(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {funcionarios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Valor (Kz)</label><input className="input" type="number" placeholder="0" value={nAmount} onChange={e => setNAmount(e.target.value)} /></div>
                <div>
                  <label className="label">Conta (sai já)</label>
                  <select className="input" value={nAccount} onChange={e => setNAccount(e.target.value)}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmtKz(a.currentBalance)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Data</label><input className="input" type="date" value={nDate} onChange={e => setNDate(e.target.value)} /></div>
                <div><label className="label">Devolução prevista <span className="text-ink-500">(opcional)</span></label><input className="input" type="date" value={nDue} onChange={e => setNDue(e.target.value)} /></div>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={nCat} onChange={e => setNCat(e.target.value)}>
                  <option value="">— nenhuma —</option>
                  {categories.filter(c => c.isActive && c.categoryType === "expense").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Descrição <span className="text-ink-500">(opcional)</span></label><input className="input" placeholder={`${KIND_LABEL[nKind]} — ${funcionarios.find(c => c.id === nContact)?.name || ""}`} value={nDesc} onChange={e => setNDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Nº documento <span className="text-ink-500">(opcional)</span></label><input className="input" value={nDocNumber} onChange={e => setNDocNumber(e.target.value)} /></div>
                <div><label className="label">Observação <span className="text-ink-500">(opcional)</span></label><input className="input" value={nNotes} onChange={e => setNNotes(e.target.value)} /></div>
              </div>
              <button onClick={() => void submitNew()} disabled={!nContact || !nAccount || !nAmount} className="btn-primary w-full justify-center disabled:opacity-40">Conceder</button>
            </div>
          </div>
        </div>
      )}

      {payFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Registar devolução</h3>
              <button onClick={() => setPayFor(null)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-300 mb-1">{contactName(payFor.contactId)} · <span className="text-ink-500">{payFor.internalNumber}</span></p>
            <p className="text-sm text-ink-300 mb-4">Pendente: <span className="font-semibold">{fmtKz(payFor.outstandingAmount)}</span></p>
            <div className="space-y-4">
              <div>
                <label className="label">Valor devolvido (Kz)</label>
                <input className="input" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                <p className="text-[11px] text-ink-500 mt-1">Máximo {fmtKz(payFor.outstandingAmount)}. Devolução parcial fica registada como tal.</p>
              </div>
              <div>
                <label className="label">Conta de entrada</label>
                <select className="input" value={payAccount} onChange={e => setPayAccount(e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmtKz(a.currentBalance)}</option>)}
                </select>
              </div>
              <div><label className="label">Data real da devolução</label><input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
              <div><label className="label">Referência <span className="text-ink-500">(opcional)</span></label><input className="input" value={payReference} onChange={e => setPayReference(e.target.value)} /></div>
              <button onClick={() => void submitPay()} disabled={!payAccount || Number(payAmount) <= 0 || Number(payAmount) > payFor.outstandingAmount} className="btn-primary w-full justify-center disabled:opacity-40">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
