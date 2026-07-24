"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  fmtKz, fmtDate, Obligation, collectionMessage, whatsappLink,
  CollectionChannel, CollectionInteractionType, CollectionOutcome,
} from "@/lib/data";
import { MessageCircle, Copy, Phone, Clock, X, CalendarClock, ChevronDown, ChevronUp } from "lucide-react";

const CHANNELS: { v: CollectionChannel; l: string }[] = [
  { v: "whatsapp", l: "WhatsApp" }, { v: "phone", l: "Telefone" }, { v: "email", l: "Email" },
  { v: "in_person", l: "Presencial" }, { v: "other", l: "Outro" },
];
const TYPES: { v: CollectionInteractionType; l: string }[] = [
  { v: "reminder", l: "Lembrete" }, { v: "collection", l: "Cobrança" }, { v: "negotiation", l: "Negociação" },
  { v: "promise_to_pay", l: "Promessa de pagamento" }, { v: "dispute", l: "Disputa" }, { v: "note", l: "Nota" },
];
const OUTCOMES: { v: CollectionOutcome; l: string }[] = [
  { v: "contacted", l: "Contactado" }, { v: "no_response", l: "Sem resposta" }, { v: "promised_payment", l: "Prometeu pagar" },
  { v: "disputed", l: "Contestou" }, { v: "paid", l: "Pagou" }, { v: "follow_up_required", l: "Requer seguimento" }, { v: "other", l: "Outro" },
];

export default function CobrancasPage() {
  const { obligations, contacts, collectionInteractions, logInteraction } = useStore();
  const contact = (id: string) => contacts.find(c => c.id === id);

  // Recebíveis em aberto com saldo, ordenados por prioridade (mais atraso, depois maior valor)
  const items = useMemo(() =>
    obligations
      .filter(o => o.direction === "receivable" && o.lifecycleStatus === "open" && o.outstandingAmount > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstandingAmount - a.outstandingAmount),
    [obligations]
  );
  const overdue = useMemo(() => items.filter(o => o.daysOverdue > 0), [items]);

  const buckets = useMemo(() => {
    const b = { d1_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
    for (const o of overdue) {
      if (o.daysOverdue <= 7) b.d1_7 += o.outstandingAmount;
      else if (o.daysOverdue <= 30) b.d8_30 += o.outstandingAmount;
      else if (o.daysOverdue <= 60) b.d31_60 += o.outstandingAmount;
      else b.d60p += o.outstandingAmount;
    }
    return b;
  }, [overdue]);

  const overdueClients = useMemo(() => new Set(overdue.map(o => o.contactId)).size, [overdue]);
  const totalOverdue = overdue.reduce((s, o) => s + o.outstandingAmount, 0);

  const today = new Date().toISOString().slice(0, 10);
  const promises = useMemo(() => collectionInteractions.filter(i => i.promisedPaymentDate && i.promisedPaymentDate >= today).length, [collectionInteractions, today]);
  const followupsToday = useMemo(() => collectionInteractions.filter(i => i.nextFollowUpAt && i.nextFollowUpAt.slice(0, 10) <= today).length, [collectionInteractions, today]);

  const [copied, setCopied] = useState("");
  const copyMsg = async (o: Obligation) => {
    const c = contact(o.contactId);
    const msg = collectionMessage(c?.name || "cliente", o.internalNumber, o.outstandingAmount, o.dueDate);
    try { await navigator.clipboard.writeText(msg); setCopied(o.id); setTimeout(() => setCopied(""), 1800); } catch { /* ignore */ }
  };

  // Registar interação
  const [logFor, setLogFor] = useState<Obligation | null>(null);
  const [channel, setChannel] = useState<CollectionChannel>("whatsapp");
  const [itype, setItype] = useState<CollectionInteractionType>("collection");
  const [outcome, setOutcome] = useState<CollectionOutcome>("contacted");
  const [message, setMessage] = useState("");
  const [promise, setPromise] = useState("");
  const [followUp, setFollowUp] = useState("");
  const openLog = (o: Obligation) => {
    setLogFor(o); setChannel("whatsapp"); setItype("collection"); setOutcome("contacted");
    setMessage(""); setPromise(""); setFollowUp("");
  };
  const submitLog = async () => {
    if (!logFor) return;
    await logInteraction({
      obligationId: logFor.id, contactId: logFor.contactId, channel, interactionType: itype, outcome,
      message: message || undefined, promisedPaymentDate: promise || undefined,
      nextFollowUpAt: followUp ? followUp + "T09:00:00" : undefined,
    });
    setLogFor(null);
  };

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">Cobranças</h1>
        <p className="text-sm text-ink-400 mt-1">Prioriza quem cobrar hoje. As mensagens abrem no WhatsApp — nada é enviado automaticamente.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-xs text-ink-500">Total vencido</div><div className="text-xl font-semibold mt-1 text-red-400">{fmtKz(totalOverdue)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500">Clientes em atraso</div><div className="text-xl font-semibold mt-1">{overdueClients}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500">Promessas ativas</div><div className="text-xl font-semibold mt-1 text-emerald-400">{promises}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-500">Seguimentos p/ hoje</div><div className="text-xl font-semibold mt-1 text-maka-300">{followupsToday}</div></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["1–7 dias", buckets.d1_7], ["8–30 dias", buckets.d8_30], ["31–60 dias", buckets.d31_60], ["+60 dias", buckets.d60p]].map(([l, v]) => (
          <div key={l as string} className="card p-3"><div className="text-[11px] text-ink-500">{l as string}</div><div className="text-sm font-semibold mt-0.5">{fmtKz(v as number)}</div></div>
        ))}
      </div>

      <div className="card divide-y divide-ink-800">
        {items.map(o => {
          const c = contact(o.contactId);
          const wa = c?.whatsapp || c?.phone;
          const msg = collectionMessage(c?.name || "cliente", o.internalNumber, o.outstandingAmount, o.dueDate);
          const history = collectionInteractions.filter(i => i.obligationId === o.id);
          const isOpen = expanded === o.id;
          return (
            <div key={o.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c?.name || "—"} <span className="ml-1 text-[11px] text-ink-500">{o.internalNumber}</span></div>
                  <div className="text-[11px] text-ink-500">
                    Saldo {fmtKz(o.outstandingAmount)} de {fmtKz(o.originalAmount)} · vence {fmtDate(o.dueDate)}
                    {o.daysOverdue > 0 ? <span className="text-red-400"> · {o.daysOverdue}d em atraso</span> : <span className="text-emerald-400"> · em dia</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => copyMsg(o)} className="btn-ghost px-2 py-1.5" title="Copiar mensagem"><Copy size={14} /> {copied === o.id ? "Copiado" : ""}</button>
                  {wa && <a href={whatsappLink(wa, msg)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600/90 hover:bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white flex items-center gap-1"><MessageCircle size={14} /> WhatsApp</a>}
                  <button onClick={() => openLog(o)} className="btn-ghost px-2 py-1.5" title="Registar cobrança"><Phone size={14} /></button>
                  <button onClick={() => setExpanded(isOpen ? null : o.id)} className="btn-ghost px-2 py-1.5" title="Histórico">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{history.length > 0 ? history.length : ""}</button>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 pl-1 space-y-2 border-l-2 border-ink-800">
                  {history.length === 0 && <div className="text-[11px] text-ink-500 pl-3">Sem registos de cobrança.</div>}
                  {history.map(h => (
                    <div key={h.id} className="pl-3 text-[11px] text-ink-400">
                      <span className="text-ink-300 font-medium">{TYPES.find(t => t.v === h.interactionType)?.l}</span>
                      {" · "}{CHANNELS.find(ch => ch.v === h.channel)?.l}
                      {h.outcome && <span> · {OUTCOMES.find(x => x.v === h.outcome)?.l}</span>}
                      {" · "}{fmtDate(h.performedAt.slice(0, 10))}
                      {h.promisedPaymentDate && <span className="text-emerald-400 flex items-center gap-1"><Clock size={11} /> promessa {fmtDate(h.promisedPaymentDate)}</span>}
                      {h.message && <div className="text-ink-500 italic">&ldquo;{h.message}&rdquo;</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Nada a cobrar — todas as contas a receber estão liquidadas. 🎉</div>}
      </div>

      {logFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg">Registar cobrança</h3>
              <button onClick={() => setLogFor(null)} className="text-ink-400 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-300 mb-4">{contact(logFor.contactId)?.name} · {logFor.internalNumber} · saldo {fmtKz(logFor.outstandingAmount)}</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Canal</label><select className="input" value={channel} onChange={e => setChannel(e.target.value as CollectionChannel)}>{CHANNELS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
                <div><label className="label">Tipo</label><select className="input" value={itype} onChange={e => setItype(e.target.value as CollectionInteractionType)}>{TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
              </div>
              <div><label className="label">Resultado</label><select className="input" value={outcome} onChange={e => setOutcome(e.target.value as CollectionOutcome)}>{OUTCOMES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
              <div><label className="label">Resposta / nota</label><input className="input" value={message} onChange={e => setMessage(e.target.value)} placeholder="O que o cliente respondeu" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label flex items-center gap-1"><Clock size={12} /> Promessa</label><input className="input" type="date" value={promise} onChange={e => setPromise(e.target.value)} /></div>
                <div><label className="label flex items-center gap-1"><CalendarClock size={12} /> Próximo seguimento</label><input className="input" type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} /></div>
              </div>
              <button onClick={submitLog} className="btn-primary w-full justify-center">Guardar registo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
