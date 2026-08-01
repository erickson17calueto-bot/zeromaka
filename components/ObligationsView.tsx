"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  fmtKz, fmtDate, daysUntil, Obligation, ObligationDirection,
  FinancialStatus, FIN_STATUS_LABEL, OBLIGATION_KIND_LABEL, ObligationDocumentKind,
  saleTax, TAX_INSIDE_VALUE, REGIMES,
} from "@/lib/data";
import { Plus, X, RotateCcw, Ban, Wallet } from "lucide-react";

const STATUS_STYLE: Record<FinancialStatus, string> = {
  paid: "bg-emerald-500/10 text-emerald-400",
  partial: "bg-amber-500/10 text-amber-400",
  overdue: "bg-red-500/10 text-red-400",
  partial_overdue: "bg-red-500/10 text-red-400",
  due_today: "bg-maka-500/10 text-maka-300",
  open: "bg-ink-800 text-ink-300",
  cancelled: "bg-ink-900 text-ink-600",
};

export default function ObligationsView({ direction }: { direction: ObligationDirection }) {
  const { obligations, contacts, accounts, categories, settlements, reserves, company, createObligation, postSettlement, reverseSettlement, cancelObligation } = useStore();
  const reservedFor = (obligationId: string) => reserves
    .filter(r => r.obligationId === obligationId && (r.status === "active" || r.status === "partially_released"))
    .reduce((s, r) => s + r.reservedAmount, 0);
  const linkedReserve = (obligationId: string) => reserves.find(r => r.obligationId === obligationId && (r.status === "active" || r.status === "partially_released"));
  const isRec = direction === "receivable";
  const contactPool = useMemo(
    () => contacts.filter(c => !c.isArchived && (c.kind === "ambos" || c.kind === (isRec ? "cliente" : "fornecedor"))),
    [contacts, isRec]
  );
  const cats = useMemo(() => categories.filter(c => c.categoryType === (isRec ? "income" : "expense")), [categories, isRec]);

  const list = useMemo(() => obligations.filter(o => o.direction === direction), [obligations, direction]);
  const [filter, setFilter] = useState<"all" | "open" | "overdue" | "paid" | "cancelled">("all");
  const shown = useMemo(() => list.filter(o => {
    if (filter === "all") return true;
    if (filter === "overdue") return o.financialStatus === "overdue" || o.financialStatus === "partial_overdue";
    if (filter === "open") return ["open", "partial", "due_today", "overdue", "partial_overdue"].includes(o.financialStatus);
    return o.financialStatus === filter;
  }), [list, filter]);

  const totals = useMemo(() => {
    const open = list.filter(o => o.lifecycleStatus === "open");
    const outstanding = open.reduce((s, o) => s + o.outstandingAmount, 0);
    const overdue = open.filter(o => o.daysOverdue > 0).reduce((s, o) => s + o.outstandingAmount, 0);
    const due7 = open.filter(o => { const d = daysUntil(o.dueDate); return d >= 0 && d <= 7; }).reduce((s, o) => s + o.outstandingAmount, 0);
    return { outstanding, overdue, due7, count: open.length };
  }, [list]);

  // ---- Create modal ----
  const [showNew, setShowNew] = useState(false);
  const [nContact, setNContact] = useState("");
  const [nAmount, setNAmount] = useState("");
  const [nDue, setNDue] = useState("");
  const [nIssue, setNIssue] = useState(new Date().toISOString().slice(0, 10));
  const [nKind, setNKind] = useState<ObligationDocumentKind>(isRec ? "invoice_reference" : "supplier_invoice");
  const [nExtRef, setNExtRef] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nCat, setNCat] = useState("");
  const [nIsSale, setNIsSale] = useState(true);
  const openNew = () => {
    setNContact(contactPool[0]?.id ?? ""); setNAmount(""); setNDesc(""); setNExtRef(""); setNCat("");
    setNIssue(new Date().toISOString().slice(0, 10)); setNDue(new Date().toISOString().slice(0, 10));
    setNKind(isRec ? "invoice_reference" : "supplier_invoice"); setNIsSale(true); setShowNew(true);
  };
  const nTaxPreview = isRec && nIsSale && Number(nAmount) > 0 ? saleTax(Number(nAmount), company.regime) : 0;
  const submitNew = async () => {
    if (!nContact || !nAmount || !nDue) return;
    const err = await createObligation({
      direction, contactId: nContact, amount: Number(nAmount), dueDate: nDue, issueDate: nIssue,
      documentKind: nKind, externalDocumentNumber: nExtRef || undefined, description: nDesc || undefined,
      categoryId: nCat || undefined, isSale: isRec ? nIsSale : false,
    });
    if (!err) setShowNew(false);
  };

  // ---- Payment modal ----
  const [payFor, setPayFor] = useState<Obligation | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payUseReserve, setPayUseReserve] = useState(false);
  const openPay = (o: Obligation) => {
    setPayFor(o); setPayAmount(String(o.outstandingAmount));
    setPayAccount(accounts[0]?.id ?? ""); setPayMethod(""); setPayUseReserve(!!linkedReserve(o.id));
  };
  const submitPay = async () => {
    if (!payFor || !payAccount || !payAmount) return;
    const reserve = !isRec && payUseReserve ? linkedReserve(payFor.id) : undefined;
    const err = await postSettlement({
      direction: isRec ? "incoming" : "outgoing", contactId: payFor.contactId, accountId: payAccount,
      allocations: [{ obligationId: payFor.id, amount: Number(payAmount) }], paymentMethod: payMethod || undefined,
      reserveId: reserve?.id,
    });
    if (!err) setPayFor(null);
  };

  // ---- Reverse / cancel ----
  const [reverseFor, setReverseFor] = useState<Obligation | null>(null);
  const [cancelFor, setCancelFor] = useState<Obligation | null>(null);
  const [actionReason, setActionReason] = useState("");
  const obSettlements = (o: Obligation) => settlements.filter(s => s.status === "posted" && s.allocations.some(a => a.obligationId === o.id));
  const doReverse = async () => {
    if (!reverseFor) return;
    const posted = obSettlements(reverseFor);
    const last = posted[0];
    if (last) await reverseSettlement(last.id, actionReason || "Sem motivo indicado");
    setReverseFor(null); setActionReason("");
  };
  const doCancel = async () => {
    if (!cancelFor) return;
    await cancelObligation(cancelFor.id, actionReason || "Sem motivo indicado");
    setCancelFor(null); setActionReason("");
  };

  const contactName = (id: string) => contacts.find(c => c.id === id)?.name ?? "—";
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">{isRec ? "Contas a receber" : "Contas a pagar"}</h1>
          <p className="text-sm text-ink-400 mt-1">
            {totals.count} documento{totals.count !== 1 ? "s" : ""} em aberto · controlo interno, não é documento fiscal certificado
          </p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={15} /> {isRec ? "Nova conta a receber" : "Nova conta a pagar"}</button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-ink-500">{isRec ? "Total a receber" : "Total a pagar"}</div><div className="text-xl font-semibold mt-1">{fmtKz(totals.outstanding)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500">Vencido</div><div className="text-xl font-semibold mt-1 text-red-400">{fmtKz(totals.overdue)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500">Vence em 7 dias</div><div className="text-xl font-semibold mt-1 text-amber-400">{fmtKz(totals.due7)}</div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "open", "overdue", "paid", "cancelled"] as const).map(v => (
          <button key={v} onClick={() => setFilter(v)}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${filter === v ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
            {{ all: "Todos", open: "Em aberto", overdue: "Vencidos", paid: "Pagos", cancelled: "Cancelados" }[v]}
          </button>
        ))}
      </div>

      <div className="card divide-y divide-ink-800">
        {shown.map(o => {
          const canPay = o.lifecycleStatus === "open" && o.outstandingAmount > 0;
          const canReverse = o.paidAmount > 0 && o.lifecycleStatus === "open";
          const canCancel = o.lifecycleStatus === "open" && o.paidAmount === 0;
          return (
            <div key={o.id} className={`p-4 flex items-center gap-3 group ${o.lifecycleStatus === "cancelled" ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {contactName(o.contactId)}
                  <span className="ml-2 text-[11px] text-ink-500">{o.internalNumber}</span>
                </div>
                <div className="text-[11px] text-ink-500">
                  {OBLIGATION_KIND_LABEL[o.documentKind]}{o.externalDocumentNumber ? ` · ${o.externalDocumentNumber}` : ""} · vence {fmtDate(o.dueDate)}
                  {o.daysOverdue > 0 && <span className="text-red-400"> · {o.daysOverdue}d em atraso</span>}
                  {!isRec && reservedFor(o.id) > 0 && (() => { const r = Math.min(reservedFor(o.id), o.outstandingAmount); const unc = o.outstandingAmount - r; return (
                    <span className="text-emerald-400"> · reservado {fmtKz(r)}{unc > 0 ? <span className="text-amber-400"> · descoberto {fmtKz(unc)}</span> : ""}</span>
                  ); })()}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{fmtKz(o.outstandingAmount)}</div>
                {o.paidAmount > 0 && <div className="text-[10px] text-ink-500">de {fmtKz(o.originalAmount)}</div>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[o.financialStatus]}`}>{FIN_STATUS_LABEL[o.financialStatus]}</span>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {canPay && <button onClick={() => openPay(o)} className="text-ink-500 hover:text-emerald-400" title="Registar pagamento"><Wallet size={15} /></button>}
                {canReverse && <button onClick={() => { setReverseFor(o); setActionReason(""); }} className="text-ink-500 hover:text-amber-400" title="Reverter pagamento"><RotateCcw size={14} /></button>}
                {canCancel && <button onClick={() => { setCancelFor(o); setActionReason(""); }} className="text-ink-500 hover:text-red-400" title="Cancelar documento"><Ban size={14} /></button>}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Sem documentos para este filtro.</div>}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">{isRec ? "Nova conta a receber" : "Nova conta a pagar"}</h3>
              <button onClick={() => setShowNew(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">{isRec ? "Cliente" : "Fornecedor"}</label>
                <select className="input" value={nContact} onChange={e => setNContact(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {contactPool.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {contactPool.length === 0 && <p className="text-[11px] text-amber-400 mt-1">Cria um contacto {isRec ? "cliente" : "fornecedor"} primeiro.</p>}
              </div>
              <div><label className="label">Valor (Kz)</label><input className="input" type="number" placeholder="0" value={nAmount} onChange={e => setNAmount(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Emissão</label><input className="input" type="date" value={nIssue} onChange={e => setNIssue(e.target.value)} /></div>
                <div><label className="label">Vencimento</label><input className="input" type="date" value={nDue} onChange={e => setNDue(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={nKind} onChange={e => setNKind(e.target.value as ObligationDocumentKind)}>
                    {Object.entries(OBLIGATION_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="label">Nº documento externo</label><input className="input" placeholder="opcional" value={nExtRef} onChange={e => setNExtRef(e.target.value)} /></div>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={nCat} onChange={e => setNCat(e.target.value)}>
                  <option value="">— nenhuma —</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Descrição</label><input className="input" placeholder="opcional" value={nDesc} onChange={e => setNDesc(e.target.value)} /></div>
              {isRec && (
                <label className="flex items-start gap-2 text-sm text-ink-300 rounded-lg border border-ink-800 p-3 cursor-pointer">
                  <input type="checkbox" checked={nIsSale} onChange={e => setNIsSale(e.target.checked)} className="mt-0.5" />
                  <span>
                    É uma venda (produto ou serviço) — calcula imposto
                    <span className="block text-[11px] text-ink-500 mt-0.5">
                      Regime {REGIMES[company.regime].tax}
                      {TAX_INSIDE_VALUE[company.regime]
                        ? " — imposto contido no valor da fatura."
                        : " — imposto calculado sobre o valor (a fatura não leva imposto)."}
                      {nTaxPreview > 0 ? <> Imposto: <span className="text-yellow-400 font-semibold">{fmtKz(nTaxPreview)}</span>
                        {TAX_INSIDE_VALUE[company.regime] ? <> · líquido: {fmtKz(Number(nAmount) - nTaxPreview)}</> : null}</> : null}
                    </span>
                  </span>
                </label>
              )}
              <button onClick={submitNew} disabled={!nContact || !nAmount || !nDue} className="btn-primary w-full justify-center disabled:opacity-40">Criar documento</button>
            </div>
          </div>
        </div>
      )}

      {payFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Registar {isRec ? "recebimento" : "pagamento"}</h3>
              <button onClick={() => setPayFor(null)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-300 mb-1">{contactName(payFor.contactId)} · <span className="text-ink-500">{payFor.internalNumber}</span></p>
            <p className="text-sm text-ink-300 mb-4">Saldo pendente: <span className="font-semibold">{fmtKz(payFor.outstandingAmount)}</span></p>
            <div className="space-y-4">
              <div>
                <label className="label">Valor a {isRec ? "receber" : "pagar"} (Kz)</label>
                <input className="input" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                <p className="text-[11px] text-ink-500 mt-1">Máximo {fmtKz(payFor.outstandingAmount)}. Valores menores registam pagamento parcial.</p>
              </div>
              <div>
                <label className="label">{isRec ? "Conta de entrada" : "Conta de saída"}</label>
                <select className="input" value={payAccount} onChange={e => setPayAccount(e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmtKz(a.currentBalance)}</option>)}
                </select>
              </div>
              <div><label className="label">Método (opcional)</label><input className="input" placeholder="Transferência, numerário, TPA..." value={payMethod} onChange={e => setPayMethod(e.target.value)} /></div>
              {!isRec && linkedReserve(payFor.id) && (
                <label className="flex items-center gap-2 text-sm text-ink-300 rounded-lg border border-ink-800 p-3 cursor-pointer">
                  <input type="checkbox" checked={payUseReserve} onChange={e => setPayUseReserve(e.target.checked)} />
                  Consumir a reserva ligada ({fmtKz(linkedReserve(payFor.id)!.reservedAmount)})
                </label>
              )}
              <button onClick={submitPay} disabled={!payAccount || Number(payAmount) <= 0 || Number(payAmount) > payFor.outstandingAmount} className="btn-primary w-full justify-center disabled:opacity-40">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {reverseFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <h3 className="font-display text-lg text-amber-400 mb-3">Reverter último pagamento</h3>
            <p className="text-sm text-ink-300 mb-4">{reverseFor.internalNumber} — repõe o saldo pendente e anula o movimento no livro. Histórico é preservado.</p>
            <div className="mb-4"><label className="label">Motivo</label><input className="input" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Ex.: pagamento incorreto" /></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setReverseFor(null)} className="btn-ghost">Cancelar</button>
              <button onClick={doReverse} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500">Reverter</button>
            </div>
          </div>
        </div>
      )}

      {cancelFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <h3 className="font-display text-lg text-red-400 mb-3">Cancelar documento</h3>
            <p className="text-sm text-ink-300 mb-4">{cancelFor.internalNumber} — o documento fica no histórico como cancelado. Só é possível sem pagamentos.</p>
            <div className="mb-4"><label className="label">Motivo</label><input className="input" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Ex.: emitido por engano" /></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCancelFor(null)} className="btn-ghost">Fechar</button>
              <button onClick={doCancel} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Cancelar documento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
