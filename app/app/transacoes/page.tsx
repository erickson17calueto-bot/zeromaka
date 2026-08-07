"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, JournalEntry, EntryDocumentKind, ENTRY_DOCUMENT_KIND_LABEL } from "@/lib/data";
import { Plus, TrendingUp, TrendingDown, ArrowLeftRight, RotateCcw, ChevronLeft, ChevronRight, X } from "lucide-react";

const PAGE_SIZE = 20;

export default function TransacoesPage() {
  const { journalEntries, accounts, categories, addTransaction, reverseEntry } = useStore();
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [accFilter, setAccFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [show, setShow] = useState(false);
  const [showReverse, setShowReverse] = useState<JournalEntry | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [parentCatId, setParentCatId] = useState("");
  const [subCatId, setSubCatId] = useState("");
  const [accId, setAccId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // Documento: nunca obrigatório — muitos pagamentos não têm fatura.
  const [docKind, setDocKind] = useState<EntryDocumentKind>("none");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [reference, setReference] = useState("");
  const [docNotes, setDocNotes] = useState("");

  // Categorias arquivadas não entram num lançamento novo — só ficam visíveis
  // no histórico dos lançamentos que já as usavam (via categoryName, já
  // gravado nesse lançamento, independente do estado atual da categoria).
  const activeCats = useMemo(() => categories.filter(c => c.isActive), [categories]);
  const parentCats = useMemo(() => activeCats.filter(c => !c.parentId && c.categoryType === txType), [activeCats, txType]);
  const subCats = useMemo(() => activeCats.filter(c => c.parentId === parentCatId), [activeCats, parentCatId]);

  const displayEntries = useMemo(() => {
    let list = journalEntries.filter(e =>
      e.entryType !== "opening_balance" && e.entryType !== "adjustment" && e.entryType !== "reversal"
    );
    if (filter !== "all") list = list.filter(e => e.entryType === filter);
    if (accFilter) list = list.filter(e => e.lines.some(l => l.accountId === accFilter));
    if (dateFrom) list = list.filter(e => e.transactionDate >= dateFrom);
    if (dateTo) list = list.filter(e => e.transactionDate <= dateTo);
    return list;
  }, [journalEntries, filter, accFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(displayEntries.length / PAGE_SIZE);
  const pageEntries = displayEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";

  const openNew = () => {
    setTxType("expense"); setAmount(""); setDesc("");
    setParentCatId(""); setSubCatId("");
    setAccId(accounts[0]?.id ?? ""); setDate(new Date().toISOString().slice(0, 10));
    setDocKind("none"); setDocNumber(""); setDocDate(""); setReference(""); setDocNotes("");
    setShow(true);
  };

  const submit = () => {
    if (!amount || !desc.trim() || !accId) return;
    const categoryId = subCatId || parentCatId || undefined;
    const cat = categories.find(c => c.id === categoryId);
    addTransaction({
      accountId: accId, type: txType, amount: Number(amount), description: desc.trim(), date,
      category: cat?.name || "", categoryId,
      reference: reference.trim() || undefined,
      documentKind: docKind,
      documentNumber: docKind === "none" ? undefined : (docNumber.trim() || undefined),
      documentDate: docKind === "none" ? undefined : (docDate || undefined),
      documentNotes: docKind === "none" ? (docNotes.trim() || undefined) : undefined,
    });
    setShow(false);
  };

  const submitReverse = () => {
    if (!showReverse) return;
    reverseEntry(showReverse.id, reverseReason || "Sem motivo indicado");
    setShowReverse(null); setReverseReason("");
  };

  const entryIcon = (e: JournalEntry) => e.entryType === "transfer" ? ArrowLeftRight : e.entryType === "income" ? TrendingUp : TrendingDown;
  const entryBg = (e: JournalEntry) => {
    if (e.status === "reversed") return "bg-ink-900 text-ink-600";
    if (e.entryType === "transfer") return "bg-ink-800 text-ink-300";
    return e.entryType === "income" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400";
  };
  const entryColor = (e: JournalEntry) => {
    if (e.status === "reversed") return "text-ink-600";
    if (e.entryType === "transfer") return "text-ink-300";
    return e.entryType === "income" ? "text-emerald-400" : "text-red-400";
  };
  const entryAmount = (e: JournalEntry) => e.lines[0]?.amount ?? 0;
  const entryAccounts = (e: JournalEntry) => {
    if (e.entryType === "transfer") {
      const from = e.lines.find(l => l.direction === "credit");
      const to = e.lines.find(l => l.direction === "debit");
      return `${accName(from?.accountId || "")} → ${accName(to?.accountId || "")}`;
    }
    return accName(e.lines[0]?.accountId || "");
  };

  const hasFilters = filter !== "all" || accFilter || dateFrom || dateTo;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Movimentos</h1>
          <p className="text-sm text-ink-400 mt-1">{displayEntries.length} lançamento{displayEntries.length !== 1 ? "s" : ""} · vendas registam-se em Faturas</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={15} /> Novo lançamento</button>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        {(["all", "income", "expense", "transfer"] as const).map(v => (
          <button key={v} onClick={() => { setFilter(v); setPage(0); }}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${filter === v ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
            {{ all: "Todos", income: "Receitas", expense: "Despesas", transfer: "Transferências" }[v]}
          </button>
        ))}
        <div className="flex-1" />
        <select className="input text-sm py-1.5 w-auto" value={accFilter} onChange={e => { setAccFilter(e.target.value); setPage(0); }}>
          <option value="">Todas as contas</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" className="input text-sm py-1.5 w-auto" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
        <input type="date" className="input text-sm py-1.5 w-auto" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
        {hasFilters && (
          <button onClick={() => { setFilter("all"); setAccFilter(""); setDateFrom(""); setDateTo(""); setPage(0); }}
            className="text-xs text-ink-400 hover:text-maka-400 flex items-center gap-1"><X size={12} /> Limpar</button>
        )}
      </div>

      <div className="card divide-y divide-ink-800">
        {pageEntries.map(e => {
          const Icon = entryIcon(e);
          const isReversed = e.status === "reversed";
          return (
            <div key={e.id} className={`p-4 flex items-center gap-3 group ${isReversed ? "opacity-50" : ""}`}>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${entryBg(e)}`}>
                {isReversed ? <RotateCcw size={16} /> : <Icon size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {e.description}
                  {isReversed && <span className="ml-2 text-[10px] text-red-400 font-bold uppercase">Revertido</span>}
                </div>
                <div className="text-[11px] text-ink-500">
                  {e.entryNumber}{e.categoryName ? ` · ${e.categoryName}` : ""} · {entryAccounts(e)} · {fmtDate(e.transactionDate)}
                  {e.documentNumber ? ` · ${e.documentNumber}` : ""}{e.reference ? ` · ref. ${e.reference}` : ""}
                </div>
              </div>
              <div className={`text-sm font-semibold ${entryColor(e)}`}>
                {e.entryType === "income" ? "+" : e.entryType === "expense" ? "−" : ""}{fmtKz(entryAmount(e))}
              </div>
              {!isReversed && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setShowReverse(e); setReverseReason(""); }}
                    className="text-ink-500 hover:text-red-400" title="Reverter"><RotateCcw size={14} /></button>
                </div>
              )}
            </div>
          );
        })}
        {pageEntries.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-500">
            {hasFilters ? "Sem lançamentos para este filtro." : "Sem lançamentos. Clica em \"Novo lançamento\" para começar."}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-sm text-ink-400">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-ghost disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {show && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg">Novo lançamento</h3>
              <button onClick={() => setShow(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setTxType("income"); setParentCatId(""); setSubCatId(""); }}
                  className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${txType === "income" ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-ink-700 text-ink-400"}`}>Receita</button>
                <button onClick={() => { setTxType("expense"); setParentCatId(""); setSubCatId(""); }}
                  className={`rounded-lg border p-3 text-sm font-semibold transition-colors ${txType === "expense" ? "border-red-500 bg-red-500/10 text-red-300" : "border-ink-700 text-ink-400"}`}>Despesa</button>
              </div>
              <div><label className="label">Valor (Kz)</label><input className="input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
              <div><label className="label">Descrição</label><input className="input" placeholder="Ex.: Compra de mercadoria" value={desc} onChange={e => setDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoria</label>
                  <select className="input" value={parentCatId} onChange={e => { setParentCatId(e.target.value); setSubCatId(""); }}>
                    <option value="">— nenhuma —</option>
                    {parentCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label flex items-center justify-between">
                    Subcategoria
                    {subCatId && <button type="button" className="text-[10px] text-ink-500 hover:text-ink-300 normal-case font-normal" onClick={() => setSubCatId("")}>limpar</button>}
                  </label>
                  <select className="input" value={subCatId} onChange={e => setSubCatId(e.target.value)} disabled={!subCats.length}>
                    <option value="">{subCats.length ? "— nenhuma —" : "sem subcategorias"}</option>
                    {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">Conta</label>
                <select className="input" value={accId} onChange={e => setAccId(e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div><label className="label">Data do lançamento</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>

              <div className="pt-2 border-t border-ink-800">
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label">Tipo de documento</label>
                    <select className="input" value={docKind} onChange={e => setDocKind(e.target.value as EntryDocumentKind)}>
                      {Object.entries(ENTRY_DOCUMENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">N.º do documento</label>
                    <input className="input" placeholder="opcional" value={docNumber} onChange={e => setDocNumber(e.target.value)} disabled={docKind === "none"} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div><label className="label">Referência (bancária/pagamento)</label><input className="input" placeholder="opcional" value={reference} onChange={e => setReference(e.target.value)} /></div>
                  <div><label className="label">Data do documento</label><input className="input" type="date" value={docDate} onChange={e => setDocDate(e.target.value)} disabled={docKind === "none"} /></div>
                </div>
                {docKind === "none" && (
                  <div className="mt-3">
                    <label className="label">Motivo ou observação (opcional)</label>
                    <input className="input" placeholder="Ex.: compra em numerário, sem recibo" value={docNotes} onChange={e => setDocNotes(e.target.value)} />
                    {txType === "expense" && (
                      <p className="text-[11px] text-ink-500 mt-1.5">
                        Sem documento não significa que a despesa não é válida — só que não há comprovativo. A dedutibilidade fiscal depende do regime da empresa e das regras da AGT; confirma com o teu contabilista antes de a considerar em declarações.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button onClick={submit} className="btn-primary w-full justify-center">Registar (+50 XP)</button>
            </div>
          </div>
        </div>
      )}

      {showReverse && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg text-red-400">Reverter movimento</h3>
              <button onClick={() => setShowReverse(null)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-300 mb-2">Reverter <span className="font-semibold text-ink-100">{showReverse.entryNumber}</span> — {showReverse.description}</p>
            <p className="text-sm text-ink-300 mb-4">Valor: <span className="font-semibold">{fmtKz(entryAmount(showReverse))}</span></p>
            <p className="text-[11px] text-ink-500 mb-3">O lançamento original fica no histórico como revertido. Será criado um contra-lançamento para anular o efeito.</p>
            <div className="mb-4"><label className="label">Motivo da reversão</label><input className="input" placeholder="Ex.: Erro no valor, duplicado..." value={reverseReason} onChange={e => setReverseReason(e.target.value)} /></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowReverse(null)} className="btn-ghost">Cancelar</button>
              <button onClick={submitReverse} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors">Reverter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
