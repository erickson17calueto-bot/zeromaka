"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, daysUntil, INVOICE_CATEGORIES, Invoice, InvoiceType, REGIMES, taxIncluded, PAYMENT_TERMS } from "@/lib/data";
import { Plus, X, CheckCircle2, AlertTriangle, MessageCircle, Pencil, Trash2 } from "lucide-react";

export default function FaturasPage() {
  const { invoices, accounts, contacts, company, taxRate, addInvoice, editInvoice, deleteInvoice, markPaid } = useStore();
  const [tab, setTab] = useState<InvoiceType>("receivable");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [payAcc, setPayAcc] = useState(accounts[0]?.id ?? "");

  const [contact, setContact] = useState("");
  const [nType, setNType] = useState<InvoiceType>("receivable");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState(INVOICE_CATEGORIES.receivable[0]);
  const [err, setErr] = useState("");

  const cur = useMemo(() => invoices.filter((i) => i.type === tab), [invoices, tab]);
  const cols: { key: Invoice["status"]; label: string; tone: string; border: string }[] = [
    { key: "pending", label: "Pendentes", tone: "text-yellow-400", border: "border-yellow-500/30" },
    { key: "overdue", label: "Vencidas", tone: "text-red-400", border: "border-red-500/30" },
    { key: "paid", label: "Pagas", tone: "text-emerald-400", border: "border-emerald-500/30" }
  ];

  const recvTotal = invoices.filter((i) => i.type === "receivable" && i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const payTotal = invoices.filter((i) => i.type === "payable" && i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const balance = accounts.reduce((s, a) => s + a.currentBalance, 0);
  const payable7 = invoices.filter((i) => i.type === "payable" && i.status !== "paid" && daysUntil(i.dueDate) <= 7).reduce((s, i) => s + i.amount, 0);

  const isSale = nType === "receivable";
  const previewTax = isSale ? taxIncluded(Number(amount || 0), taxRate) : 0;

  const termOf = (name: string) => { const c = contacts.find((x) => x.name === name); return c?.paymentTerm ? PAYMENT_TERMS[c.paymentTerm] : null; };

  const openNew = () => { setEditing(null); setNType(tab); setContact(""); setAmount(""); setDue(new Date().toISOString().slice(0, 10)); setCat(INVOICE_CATEGORIES[tab][0]); setErr(""); setShow(true); };
  const openEdit = (i: Invoice) => { setEditing(i); setNType(i.type); setContact(i.contactName); setAmount(String(i.amount)); setDue(i.dueDate); setCat(i.category); setErr(""); setShow(true); };

  const submit = () => {
    setErr("");
    if (!contact.trim() || !amount) { setErr("Preenche o contacto e o valor."); return; }
    const sale = nType === "receivable";
    const payload = { contactName: contact.trim(), type: nType, amount: Number(amount), dueDate: due, category: cat, isSale: sale, taxAmount: sale ? taxIncluded(Number(amount), taxRate) : undefined, issueDate: editing?.issueDate || new Date().toISOString().slice(0, 10) };
    if (editing) { const e = editInvoice(editing.id, payload); if (e) { setErr(e); return; } }
    else addInvoice(payload);
    setShow(false);
  };

  const waLink = (i: Invoice) => {
    const c = contacts.find((x) => x.name === i.contactName);
    const phone = (c?.phone || "").replace(/\D/g, "");
    const msg = encodeURIComponent(`Boa tarde, ${i.contactName}. Lembrete da fatura de ${fmtKz(i.amount)} com vencimento em ${fmtDate(i.dueDate)}. Obrigado! — ${company.name}`);
    return `https://wa.me/${phone}?text=${msg}`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Faturas</h1>
          <p className="text-sm text-ink-400 mt-1">Contas a receber e a pagar. O imposto está contido no valor (não é acrescido).</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={15} /> Nova fatura</button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">A receber (aberto)</div><div className="mt-1.5 font-display text-xl text-emerald-400">{fmtKz(recvTotal)}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">A pagar (aberto)</div><div className="mt-1.5 font-display text-xl text-red-400">{fmtKz(payTotal)}</div></div>
        <div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Saldo atual</div><div className="mt-1.5 font-display text-xl">{fmtKz(balance)}</div></div>
      </section>

      {payable7 > balance && (
        <div className="card border-red-500/40 bg-red-500/5 p-4 flex gap-3 items-start text-sm">
          <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
          <p className="text-ink-300"><span className="font-semibold text-red-300">Risco de liquidez:</span> as faturas a pagar em 7 dias ({fmtKz(payable7)}) excedem o saldo em caixa. Prioriza a cobrança das vencidas.</p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setTab("receivable")} className={`rounded-full px-5 py-2 text-sm font-semibold border transition-colors ${tab === "receivable" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-ink-700 text-ink-400"}`}>A receber (clientes)</button>
        <button onClick={() => setTab("payable")} className={`rounded-full px-5 py-2 text-sm font-semibold border transition-colors ${tab === "payable" ? "border-red-500 bg-red-500/10 text-red-300" : "border-ink-700 text-ink-400"}`}>A pagar (fornecedores)</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cols.map((c) => {
          const items = cur.filter((i) => i.status === c.key);
          return (
            <div key={c.key} className={`card border ${c.border} p-4 min-h-[180px]`}>
              <div className={`flex items-center justify-between text-sm font-semibold ${c.tone}`}>{c.label}<span className="text-[11px] rounded-full bg-ink-800 text-ink-300 px-2 py-0.5">{items.length}</span></div>
              <div className="mt-3 space-y-2.5">
                {items.map((i) => {
                  const term = termOf(i.contactName);
                  return (
                    <div key={i.id} className="rounded-lg bg-ink-950 border border-ink-800 p-3 group">
                      <div className="flex justify-between gap-2">
                        <div className="text-sm font-medium truncate">{i.contactName}</div>
                        <div className="text-sm font-semibold shrink-0">{fmtKz(i.amount)}</div>
                      </div>
                      {i.taxAmount ? <div className="text-[10px] text-yellow-500/80 mt-0.5">Inclui {fmtKz(i.taxAmount)} de imposto</div> : null}
                      <div className="mt-1 text-[11px] text-ink-500">{i.category} · {i.status === "paid" && i.paidAt ? `Paga ${fmtDate(i.paidAt)}` : `Vence ${fmtDate(i.dueDate)}`}{term ? ` · ${term}` : ""}</div>
                      <div className="mt-2.5 flex gap-1.5 items-center">
                        {i.status !== "paid" && (
                          <>
                            <button onClick={() => { setPaying(i); setPayAcc(accounts[0]?.id ?? ""); }} className="flex-1 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-[12px] font-semibold py-1.5 flex items-center justify-center gap-1.5 transition-colors">
                              <CheckCircle2 size={13} /> {i.type === "receivable" ? "Recebida" : "Paga"}
                            </button>
                            {i.type === "receivable" && i.status === "overdue" && (
                              <a href={waLink(i)} target="_blank" rel="noreferrer" className="rounded-lg border border-ink-700 text-ink-300 hover:bg-ink-800 px-2.5 py-1.5 flex items-center transition-colors" title="Cobrar via WhatsApp"><MessageCircle size={14} /></a>
                            )}
                            <button onClick={() => openEdit(i)} className="rounded-lg border border-ink-700 text-ink-400 hover:text-maka-400 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={13} /></button>
                            <button onClick={() => { const e = deleteInvoice(i.id); }} className="rounded-lg border border-ink-700 text-ink-400 hover:text-red-400 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-[12px] text-ink-600 py-4 text-center">Vazio</div>}
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5"><h3 className="font-display text-lg">{editing ? "Editar fatura" : "Nova fatura"}</h3><button onClick={() => setShow(false)} className="text-ink-400 hover:text-white"><X size={18} /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setNType("receivable"); setCat(INVOICE_CATEGORIES.receivable[0]); }} className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${nType === "receivable" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-ink-700 text-ink-400"}`}>A receber</button>
                <button onClick={() => { setNType("payable"); setCat(INVOICE_CATEGORIES.payable[0]); }} className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${nType === "payable" ? "border-red-500 bg-red-500/10 text-red-300" : "border-ink-700 text-ink-400"}`}>A pagar</button>
              </div>
              <div>
                <label className="label">{nType === "receivable" ? "Cliente" : "Fornecedor"}</label>
                <input className="input" list="contacts-dl" placeholder="Nome do contacto" value={contact} onChange={(e) => setContact(e.target.value)} />
                <datalist id="contacts-dl">{contacts.filter((c) => c.kind === (nType === "receivable" ? "cliente" : "fornecedor")).map((c) => <option key={c.id} value={c.name} />)}</datalist>
                {termOf(contact) && <p className="text-[11px] text-emerald-400/80 mt-1">Forma de pagamento: {termOf(contact)}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Valor da fatura (Kz)</label><input className="input" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div><label className="label">Vencimento</label><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              </div>
              {isSale && Number(amount) > 0 && (
                <div className="rounded-lg bg-ink-950 border border-ink-800 p-3 text-[12px] space-y-1">
                  <div className="flex justify-between"><span className="text-ink-400">Valor total da fatura</span><span className="font-mono">{fmtKz(Number(amount))}</span></div>
                  <div className="flex justify-between text-yellow-400"><span>Imposto contido ({REGIMES[company.regime].tax})</span><span className="font-mono">{fmtKz(previewTax)}</span></div>
                  <p className="text-[10px] text-ink-500 pt-1">O imposto não é somado — fica registado como referência para o apuramento nos Relatórios.</p>
                </div>
              )}
              <div><label className="label">Categoria</label><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{INVOICE_CATEGORIES[nType].map((c) => <option key={c}>{c}</option>)}</select></div>
              {err && <p className="text-sm text-red-400">{err}</p>}
              <button onClick={submit} className="btn-primary w-full justify-center">{editing ? "Guardar alterações" : "Criar fatura (+50 XP)"}</button>
            </div>
          </div>
        </div>
      )}

      {paying && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-sm w-full p-6">
            <h3 className="font-display text-lg">Confirmar liquidação</h3>
            <p className="text-sm text-ink-300 mt-2">{paying.type === "receivable" ? "Receber" : "Pagar"} <span className="font-semibold">{fmtKz(paying.amount)}</span> — {paying.contactName}. A transação é criada e o saldo atualizado.</p>
            {paying.taxAmount ? <p className="text-[12px] text-yellow-400 mt-1">Deste valor, {fmtKz(paying.taxAmount)} é imposto a entregar ao Estado.</p> : null}
            <div className="mt-4"><label className="label">{paying.type === "receivable" ? "Conta que recebe" : "Conta que paga"}</label><select className="input" value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmtKz(a.currentBalance)}</option>)}</select></div>
            <div className="mt-5 flex gap-2 justify-end"><button onClick={() => setPaying(null)} className="btn-ghost">Cancelar</button><button onClick={() => { markPaid(paying.id, payAcc); setPaying(null); }} className="btn-primary">Confirmar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
