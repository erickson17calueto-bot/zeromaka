"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  fmtKz, fmtDate, daysUntil, Obligation, ObligationDirection, Settlement,
  FinancialStatus, FIN_STATUS_LABEL, OBLIGATION_KIND_LABEL, ObligationDocumentKind,
  saleTax, TAX_INSIDE_VALUE, REGIMES, EntryDocumentKind, ENTRY_DOCUMENT_KIND_LABEL,
} from "@/lib/data";
import { Plus, X, RotateCcw, Ban, Wallet, Pencil, Printer } from "lucide-react";

// Categorias mostradas ao criar uma obrigação — deliberadamente compactas
// (ver docs/RECEIVABLES-PAYABLES.md): uma fatura de cliente é sempre venda de
// produto ou serviço; uma fatura de fornecedor pode ser quase qualquer
// despesa, exceto as que nunca chegam por fatura de terceiro.
const RECEIVABLE_CATEGORY_NAMES = ["Vendas de produtos", "Prestação de serviços"];
const PAYABLE_EXCLUDED_CATEGORY_NAMES = ["Pessoal", "Sócios", "Financiamento", "Transferências internas"];
const NAVY = "#26305c";
const fmtAOA = (n: number) => new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " AOA";
const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));
const safeUrl = (u: string) => { const v = String(u || "").trim(); return /^(https?:\/\/|data:image\/)/i.test(v) ? v : ""; };

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
  const { obligations, contacts, accounts, categories, settlements, reserves, company, createObligation, postSettlement, reverseSettlement, cancelObligation, updateObligation } = useStore();
  const reservedFor = (obligationId: string) => reserves
    .filter(r => r.obligationId === obligationId && (r.status === "active" || r.status === "partially_released"))
    .reduce((s, r) => s + r.reservedAmount, 0);
  const linkedReserve = (obligationId: string) => reserves.find(r => r.obligationId === obligationId && (r.status === "active" || r.status === "partially_released"));
  const isRec = direction === "receivable";
  const contactPool = useMemo(
    () => contacts.filter(c => !c.isArchived && (c.kind === "ambos" || c.kind === (isRec ? "cliente" : "fornecedor"))),
    [contacts, isRec]
  );
  const catType = isRec ? "income" : "expense";
  // Arquivadas não entram numa obrigação nova (mas continuam no histórico
  // das que já as usavam, via o categoryId já gravado nessas obrigações).
  const activeCats = useMemo(() => categories.filter(c => c.isActive), [categories]);
  // Uma fatura é sempre venda de produto/serviço (a receber) ou compra de
  // algo faturado por um fornecedor (a pagar) — a árvore inteira de
  // categorias (que também cobre pessoal, sócios, transferências internas...)
  // é ruído aqui. Isso mostra-se em Transações, que cobre lançamentos diretos.
  const parentCats = useMemo(() => {
    const base = activeCats.filter(c => !c.parentId && c.categoryType === catType);
    if (isRec) return base.filter(c => RECEIVABLE_CATEGORY_NAMES.includes(c.name));
    return base.filter(c => !PAYABLE_EXCLUDED_CATEGORY_NAMES.includes(c.name));
  }, [activeCats, catType, isRec]);

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
  const [nParentCat, setNParentCat] = useState("");
  const [nSubCat, setNSubCat] = useState("");
  const [nIsSale, setNIsSale] = useState(true);
  const nSubCats = useMemo(() => activeCats.filter(c => c.parentId === nParentCat), [activeCats, nParentCat]);
  const openNew = () => {
    setNContact(contactPool[0]?.id ?? ""); setNAmount(""); setNDesc(""); setNExtRef("");
    setNParentCat(""); setNSubCat("");
    setNIssue(new Date().toISOString().slice(0, 10)); setNDue(new Date().toISOString().slice(0, 10));
    setNKind(isRec ? "invoice_reference" : "supplier_invoice"); setNIsSale(true); setShowNew(true);
  };
  const nTaxPreview = isRec && nIsSale && Number(nAmount) > 0 ? saleTax(Number(nAmount), company.regime) : 0;
  const submitNew = async () => {
    if (!nContact || !nAmount || !nDue) return;
    const err = await createObligation({
      direction, contactId: nContact, amount: Number(nAmount), dueDate: nDue, issueDate: nIssue,
      documentKind: nKind, externalDocumentNumber: nExtRef || undefined, description: nDesc || undefined,
      categoryId: nSubCat || nParentCat || undefined, isSale: isRec ? nIsSale : false,
    });
    if (!err) setShowNew(false);
  };

  // ---- Edit modal ----
  const [editFor, setEditFor] = useState<Obligation | null>(null);
  const [eContact, setEContact] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eDue, setEDue] = useState("");
  const [eIssue, setEIssue] = useState("");
  const [eExtRef, setEExtRef] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eParentCat, setEParentCat] = useState("");
  const [eSubCat, setESubCat] = useState("");
  const [eNotes, setENotes] = useState("");
  const eSubCats = useMemo(() => activeCats.filter(c => c.parentId === eParentCat), [activeCats, eParentCat]);
  const openEdit = (o: Obligation) => {
    setEditFor(o);
    setEContact(o.contactId); setEAmount(String(o.originalAmount));
    setEDue(o.dueDate); setEIssue(o.issueDate);
    setEExtRef(o.externalDocumentNumber ?? ""); setEDesc(o.description ?? ""); setENotes(o.notes ?? "");
    const cat = o.categoryId ? categories.find(c => c.id === o.categoryId) : undefined;
    if (cat?.parentId) { setEParentCat(cat.parentId); setESubCat(cat.id); }
    else { setEParentCat(cat?.id ?? ""); setESubCat(""); }
  };
  const submitEdit = async () => {
    if (!editFor || !eContact || !eAmount || !eDue) return;
    const err = await updateObligation(editFor.id, {
      contactId: eContact !== editFor.contactId ? eContact : undefined,
      description: eDesc || undefined, externalDocumentNumber: eExtRef || undefined,
      amount: Number(eAmount), issueDate: eIssue, dueDate: eDue,
      categoryId: eSubCat || eParentCat || undefined, notes: eNotes || undefined,
    });
    if (!err) setEditFor(null);
  };

  // ---- Payment modal ----
  const [payFor, setPayFor] = useState<Obligation | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payUseReserve, setPayUseReserve] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState("");
  const [payDocKind, setPayDocKind] = useState<EntryDocumentKind>("none");
  const [payDocNumber, setPayDocNumber] = useState("");
  const openPay = (o: Obligation) => {
    setPayFor(o); setPayAmount(String(o.outstandingAmount));
    setPayAccount(accounts[0]?.id ?? ""); setPayMethod(""); setPayUseReserve(!!linkedReserve(o.id));
    setPayDate(new Date().toISOString().slice(0, 10)); setPayReference("");
    setPayDocKind("none"); setPayDocNumber("");
  };
  const submitPay = async () => {
    if (!payFor || !payAccount || !payAmount) return;
    const reserve = !isRec && payUseReserve ? linkedReserve(payFor.id) : undefined;
    const err = await postSettlement({
      direction: isRec ? "incoming" : "outgoing", contactId: payFor.contactId, accountId: payAccount,
      allocations: [{ obligationId: payFor.id, amount: Number(payAmount) }], paymentMethod: payMethod || undefined,
      reserveId: reserve?.id, paymentDate: payDate, reference: payReference.trim() || undefined,
      documentKind: payDocKind, documentNumber: payDocKind === "none" ? undefined : (payDocNumber.trim() || undefined),
    });
    if (!err) setPayFor(null);
  };

  // ---- Reverse / cancel ----
  const [reverseFor, setReverseFor] = useState<Obligation | null>(null);
  const [reverseSettlementId, setReverseSettlementId] = useState("");
  const [cancelFor, setCancelFor] = useState<Obligation | null>(null);
  const [actionReason, setActionReason] = useState("");
  const obSettlements = (o: Obligation) => settlements
    .filter(s => s.status === "posted" && s.allocations.some(a => a.obligationId === o.id))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const allocatedTo = (s: Settlement, obligationId: string) => s.allocations.find(a => a.obligationId === obligationId)?.allocatedAmount ?? 0;
  const openReverse = (o: Obligation) => {
    setReverseFor(o); setActionReason("");
    setReverseSettlementId(obSettlements(o)[0]?.id ?? "");
  };
  const doReverse = async () => {
    if (!reverseFor || !reverseSettlementId) return;
    await reverseSettlement(reverseSettlementId, actionReason || "Sem motivo indicado");
    setReverseFor(null); setActionReason(""); setReverseSettlementId("");
  };
  const doCancel = async () => {
    if (!cancelFor) return;
    await cancelObligation(cancelFor.id, actionReason || "Sem motivo indicado");
    setCancelFor(null); setActionReason("");
  };

  const contactName = (id: string) => contacts.find(c => c.id === id)?.name ?? "—";
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";

  const printSettlement = (o: Obligation, settlement: Settlement) => {
    const allocated = allocatedTo(settlement, o.id);
    const title = isRec ? "RECIBO INTERNO DE RECEBIMENTO" : "COMPROVATIVO INTERNO DE PAGAMENTO";
    const logoSrc = safeUrl(company.logo || "");
    const logo = logoSrc
      ? `<img src="${esc(logoSrc)}" alt="logo" style="width:64px;height:64px;object-fit:contain;border-radius:6px" />`
      : `<div style="width:64px;height:64px;border-radius:6px;background:${NAVY};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;text-align:center;line-height:1.1">${esc((company.name || "").split(" ")[0] || "LOGO")}</div>`;
    const html = `<!doctype html><html lang="pt-AO"><head><meta charset="utf-8"><title>${esc(settlement.internalNumber)} · ${esc(title)}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:Helvetica,Arial,sans-serif;color:#1f2430;padding:38px 42px;font-size:12.5px;line-height:1.5}.head{display:flex;align-items:center;gap:16px;padding-bottom:16px}.head h1{font-size:16px;color:${NAVY}}.nif{color:#5b6472;font-size:12px;margin-top:3px}.rule{height:2px;background:${NAVY};margin:0 0 26px}.title{text-align:center;margin-bottom:24px}.title h2{color:${NAVY};font-size:22px;letter-spacing:.5px}.ref{color:#6b7280;font-size:12.5px;margin-top:4px}.band{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f3f4f6;border-radius:8px;padding:16px 20px;margin-bottom:22px}.k{font-size:10px;letter-spacing:.8px;color:#8a93a3;text-transform:uppercase;font-weight:700;margin-bottom:5px}.v{color:${NAVY};font-weight:600;font-size:13px}.amount{text-align:center;background:#f3f4f6;border-radius:8px;padding:22px;margin-bottom:24px}.amount .v{color:${NAVY};font-weight:800;font-size:28px}.obs-t{font-size:11px;letter-spacing:.8px;color:#8a93a3;text-transform:uppercase;font-weight:700;margin-bottom:8px}.obs{border:1px solid ${NAVY}33;border-radius:8px;padding:16px;min-height:50px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:100px}.sign .c{text-align:center}.line{border-top:1px solid #9aa2b1;margin-bottom:8px}.lbl{font-size:11px;color:#5b6472}.foot{text-align:center;color:#aab0bd;font-size:10px;margin-top:60px}@media print{body{padding:24px 30px}@page{margin:14mm}}</style></head><body>
      <div class="head">${logo}<div><h1>${esc(company.name || "")}</h1><div class="nif">NIF: ${esc(company.nif || "—")}</div></div></div><div class="rule"></div>
      <div class="title"><h2>${esc(title)}</h2><div class="ref">Referência: ${esc(settlement.internalNumber)}</div></div>
      <div class="band"><div><div class="k">Data</div><div class="v">${esc(settlement.paymentDate)}</div></div><div><div class="k">Estado</div><div class="v">${settlement.status === "reversed" ? "REVERTIDO" : "CONFIRMADO"}</div></div><div><div class="k">${isRec ? "Cliente" : "Fornecedor"}</div><div class="v">${esc(contactName(o.contactId))}</div></div><div><div class="k">Conta</div><div class="v">${esc(accName(settlement.accountId))}</div></div><div><div class="k">Documento de origem</div><div class="v">${esc(o.internalNumber)}${o.externalDocumentNumber ? ` · ${esc(o.externalDocumentNumber)}` : ""}</div></div><div><div class="k">Método</div><div class="v">${esc(settlement.paymentMethod || "Não indicado")}</div></div>${settlement.reference ? `<div><div class="k">Referência</div><div class="v">${esc(settlement.reference)}</div></div>` : ""}</div>
      <div class="amount"><div class="k">Valor ${isRec ? "recebido" : "pago"}</div><div class="v">${fmtAOA(allocated)}</div></div><div class="obs-t">Descrição</div><div class="obs">${esc(o.description || (isRec ? "Recebimento" : "Pagamento"))}</div>
      <div class="sign"><div class="c"><div class="line"></div><div class="lbl">Preparado / entregue por</div></div><div class="c"><div class="line"></div><div class="lbl">Conferido / recebido por</div></div></div><div class="foot">${esc(settlement.internalNumber)} · Documento interno para arquivo · Gerado por ZeroMaka</div></body></html>`;
    const frame = document.createElement("iframe"); frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"; document.body.appendChild(frame);
    const doc = frame.contentWindow!.document; doc.open(); doc.write(html); doc.close();
    setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); setTimeout(() => frame.remove(), 1200); }, 350);
  };

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
          const canEdit = o.lifecycleStatus === "open";
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
              <div className="flex items-center gap-1 shrink-0">
                {obSettlements(o).length > 0 && <button onClick={() => printSettlement(o, obSettlements(o)[0])} className="text-ink-500 hover:text-maka-400" title="Imprimir comprovativo do último pagamento"><Printer size={15} /></button>}
                {canPay && <button onClick={() => openPay(o)} className="text-ink-500 hover:text-emerald-400" title="Registar pagamento"><Wallet size={15} /></button>}
                {canEdit && <button onClick={() => openEdit(o)} className="text-ink-500 hover:text-maka-300" title="Editar documento"><Pencil size={14} /></button>}
                {canReverse && <button onClick={() => openReverse(o)} className="text-ink-500 hover:text-amber-400" title="Reverter pagamento"><RotateCcw size={14} /></button>}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoria</label>
                  <select className="input" value={nParentCat} onChange={e => { setNParentCat(e.target.value); setNSubCat(""); }}>
                    <option value="">— nenhuma —</option>
                    {parentCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label flex items-center justify-between">
                    Subcategoria
                    {nSubCat && <button type="button" className="text-[10px] text-ink-500 hover:text-ink-300 normal-case font-normal" onClick={() => setNSubCat("")}>limpar</button>}
                  </label>
                  <select className="input" value={nSubCat} onChange={e => setNSubCat(e.target.value)} disabled={!nSubCats.length}>
                    <option value="">{nSubCats.length ? "— nenhuma —" : "sem subcategorias"}</option>
                    {nSubCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
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

      {editFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Editar documento</h3>
              <button onClick={() => setEditFor(null)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {editFor.paidAmount > 0 && (
                <p className="text-[11px] text-amber-400 bg-amber-500/10 rounded-lg p-3">
                  Este documento já tem {fmtKz(editFor.paidAmount)} pago. O contacto não pode ser trocado e o valor não pode ficar abaixo do já pago.
                </p>
              )}
              <div>
                <label className="label">{isRec ? "Cliente" : "Fornecedor"}</label>
                <select className="input" value={eContact} onChange={e => setEContact(e.target.value)} disabled={editFor.paidAmount > 0}>
                  {contactPool.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {!contactPool.some(c => c.id === eContact) && <option value={eContact}>{contactName(eContact)}</option>}
                </select>
              </div>
              <div>
                <label className="label">Valor (Kz)</label>
                <input className="input" type="number" value={eAmount} onChange={e => setEAmount(e.target.value)} />
                {editFor.paidAmount > 0 && <p className="text-[11px] text-ink-500 mt-1">Mínimo {fmtKz(editFor.paidAmount)}.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Emissão</label><input className="input" type="date" value={eIssue} onChange={e => setEIssue(e.target.value)} /></div>
                <div><label className="label">Vencimento</label><input className="input" type="date" value={eDue} onChange={e => setEDue(e.target.value)} /></div>
              </div>
              <div><label className="label">Nº documento externo</label><input className="input" placeholder="opcional" value={eExtRef} onChange={e => setEExtRef(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoria</label>
                  <select className="input" value={eParentCat} onChange={e => { setEParentCat(e.target.value); setESubCat(""); }}>
                    <option value="">— nenhuma —</option>
                    {parentCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label flex items-center justify-between">
                    Subcategoria
                    {eSubCat && <button type="button" className="text-[10px] text-ink-500 hover:text-ink-300 normal-case font-normal" onClick={() => setESubCat("")}>limpar</button>}
                  </label>
                  <select className="input" value={eSubCat} onChange={e => setESubCat(e.target.value)} disabled={!eSubCats.length}>
                    <option value="">{eSubCats.length ? "— nenhuma —" : "sem subcategorias"}</option>
                    {eSubCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">Descrição</label><input className="input" placeholder="opcional" value={eDesc} onChange={e => setEDesc(e.target.value)} /></div>
              <div><label className="label">Notas</label><input className="input" placeholder="opcional" value={eNotes} onChange={e => setENotes(e.target.value)} /></div>
              <button onClick={submitEdit} disabled={!eContact || !eAmount || !eDue || (editFor.paidAmount > 0 && Number(eAmount) < editFor.paidAmount)} className="btn-primary w-full justify-center disabled:opacity-40">Guardar alterações</button>
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
              <div><label className="label">Data real do {isRec ? "recebimento" : "pagamento"}</label><input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
              <div><label className="label">Referência (bancária/pagamento)</label><input className="input" placeholder="opcional" value={payReference} onChange={e => setPayReference(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Documento externo (opcional)</label>
                  <select className="input" value={payDocKind} onChange={e => setPayDocKind(e.target.value as EntryDocumentKind)}>
                    {Object.entries(ENTRY_DOCUMENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="label">N.º do documento</label><input className="input" placeholder="opcional" value={payDocNumber} onChange={e => setPayDocNumber(e.target.value)} disabled={payDocKind === "none"} /></div>
              </div>
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

      {reverseFor && (() => {
        const posted = obSettlements(reverseFor);
        const selected = posted.find(s => s.id === reverseSettlementId);
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="font-display text-lg text-amber-400 mb-1">Reverter pagamento</h3>
              <p className="text-sm text-ink-300 mb-4">{reverseFor.internalNumber} — escolhe qual dos pagamentos abaixo reverter. Repõe o saldo pendente e anula o movimento no livro; o histórico é preservado.</p>
              {posted.length === 0 && <p className="text-sm text-ink-500 mb-4">Sem pagamentos registados para este documento.</p>}
              <div className="space-y-2 mb-4">
                {posted.map(s => (
                  <label key={s.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${reverseSettlementId === s.id ? "border-amber-500 bg-amber-500/5" : "border-ink-800 hover:border-ink-600"}`}>
                    <input type="radio" className="mt-1" name="reverse-settlement" checked={reverseSettlementId === s.id} onChange={() => setReverseSettlementId(s.id)} />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{fmtKz(allocatedTo(s, reverseFor.id))}</span>
                        <span className="text-[11px] text-ink-500">{fmtDate(s.paymentDate)}</span>
                      </div>
                      <div className="text-[11px] text-ink-500 mt-0.5">
                        {s.internalNumber}{s.paymentMethod ? ` · ${s.paymentMethod}` : ""}{s.reference ? ` · ref. ${s.reference}` : ""}
                        {s.accountId && ` · ${accName(s.accountId)}`}
                        {allocatedTo(s, reverseFor.id) < s.totalAmount && <span className="text-ink-400"> · pagamento dividido: total {fmtKz(s.totalAmount)}</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {selected && (
                <p className="text-[11px] text-ink-400 bg-ink-900 rounded-lg p-3 mb-4">
                  Vais reverter {fmtKz(allocatedTo(selected, reverseFor.id))} de {fmtDate(selected.paymentDate)} ({selected.internalNumber}). Os outros pagamentos deste documento não são afetados.
                </p>
              )}
              <div className="mb-4"><label className="label">Motivo</label><input className="input" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Ex.: pagamento incorreto" /></div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setReverseFor(null)} className="btn-ghost">Cancelar</button>
                <button onClick={doReverse} disabled={!reverseSettlementId} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40">Reverter selecionado</button>
              </div>
            </div>
          </div>
        );
      })()}

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
