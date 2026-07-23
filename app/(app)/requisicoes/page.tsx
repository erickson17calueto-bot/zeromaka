"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, CATEGORIES, Requisition, ReqItem } from "@/lib/data";
import { Plus, X, CheckCircle2, XCircle, FileSignature, Clock, Pencil, Trash2, Printer, Trash } from "lucide-react";

const NAVY = "#26305c";
const blankItem = (): ReqItem => ({ description: "", qty: 1, unitPrice: 0 });
const emptyForm = () => ({ department: "Comercial", requester: "", approver: "", items: [blankItem()], purpose: "", cat: CATEGORIES[2], date: new Date().toISOString().slice(0, 10) });

const fmtAOA = (n: number) => new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " AOA";
const fmtQty = (n: number) => new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 3 }).format(n);
const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export default function RequisicoesPage() {
  const { requisitions, accounts, company, profile, addRequisition, editRequisition, deleteRequisition, approveRequisition, rejectRequisition } = useStore();
  const [filter, setFilter] = useState<"all" | Requisition["status"]>("all");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Requisition | null>(null);
  const [approving, setApproving] = useState<Requisition | null>(null);
  const [rejecting, setRejecting] = useState<Requisition | null>(null);
  const [payAcc, setPayAcc] = useState(accounts[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [f, setF] = useState(emptyForm());
  const [err, setErr] = useState("");

  const list = useMemo(() => requisitions.filter((r) => filter === "all" ? true : r.status === filter), [requisitions, filter]);
  const pendingTotal = requisitions.filter((r) => r.status === "pendente").reduce((s, r) => s + r.amount, 0);
  const formTotal = f.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  const openNew = () => { setEditing(null); setF({ ...emptyForm(), approver: profile.name }); setErr(""); setShow(true); };
  const openEdit = (r: Requisition) => {
    setEditing(r);
    setF({ department: r.department || "Comercial", requester: r.requester, approver: r.approver, items: r.items && r.items.length ? r.items.map((i) => ({ ...i })) : [{ description: r.purpose, qty: 1, unitPrice: r.amount }], purpose: r.purpose, cat: r.category, date: r.date });
    setErr(""); setShow(true);
  };

  const setItem = (i: number, patch: Partial<ReqItem>) => setF((s) => ({ ...s, items: s.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const addItem = () => setF((s) => ({ ...s, items: [...s.items, blankItem()] }));
  const removeItem = (i: number) => setF((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, idx) => idx !== i) : s.items }));

  const submit = () => {
    setErr("");
    const items = f.items.filter((it) => it.description.trim() && Number(it.unitPrice) > 0).map((it) => ({ description: it.description.trim(), qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) }));
    if (!f.requester.trim() || !f.approver.trim()) { setErr("Preenche o requisitante e o responsável."); return; }
    if (items.length === 0) { setErr("Adiciona pelo menos um item com descrição e valor."); return; }
    const payload = { department: f.department.trim(), requester: f.requester.trim(), approver: f.approver.trim(), items, amount: items.reduce((s, it) => s + it.qty * it.unitPrice, 0), date: f.date, purpose: f.purpose.trim(), category: f.cat };
    if (editing) { const e = editRequisition(editing.id, payload); if (e) { setErr(e); return; } }
    else addRequisition(payload);
    setShow(false);
  };

  const printReq = (r: Requisition) => {
    const items = r.items && r.items.length ? r.items : [{ description: r.purpose || "—", qty: 1, unitPrice: r.amount }];
    const rows = items.map((it, i) => `<tr>
      <td class="c">${i + 1}</td><td>${esc(it.description)}</td>
      <td class="c">${fmtQty(it.qty)}</td><td class="r">${fmtAOA(it.unitPrice)}</td><td class="r">${fmtAOA(it.qty * it.unitPrice)}</td></tr>`).join("");
    const logo = company.logo
      ? `<img src="${company.logo}" alt="logo" style="width:64px;height:64px;object-fit:contain;border-radius:6px" />`
      : `<div style="width:64px;height:64px;border-radius:6px;background:${NAVY};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;text-align:center;line-height:1.1">${esc((company.name || "").split(" ")[0] || "LOGO")}</div>`;

    const html = `<!doctype html><html lang="pt-AO"><head><meta charset="utf-8">
    <title>${esc(r.number)}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Helvetica,Arial,sans-serif;color:#1f2430;padding:38px 42px;font-size:12.5px;line-height:1.5}
      .head{display:flex;align-items:center;gap:16px;padding-bottom:16px}
      .head h1{font-size:16px;color:${NAVY};letter-spacing:.2px}
      .head .nif{color:#5b6472;font-size:12px;margin-top:3px}
      .rule{height:2px;background:${NAVY};margin:0 0 26px}
      .title{text-align:center;margin-bottom:24px}
      .title h2{color:${NAVY};font-size:26px;letter-spacing:.5px}
      .title .ref{color:#6b7280;font-size:12.5px;margin-top:4px}
      .band{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:#f3f4f6;border-radius:8px;padding:16px 20px;margin-bottom:22px}
      .band .k{font-size:10px;letter-spacing:.8px;color:#8a93a3;text-transform:uppercase;font-weight:700;margin-bottom:5px}
      .band .v{color:${NAVY};font-weight:600;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead th{background:${NAVY};color:#fff;text-align:left;padding:9px 12px;font-size:11.5px;font-weight:700}
      thead th.c{text-align:center}thead th.r{text-align:right}
      tbody td{padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:12.5px}
      tbody td.c{text-align:center}tbody td.r{text-align:right}
      tfoot td{padding:11px 12px;font-weight:700;color:${NAVY}}
      tfoot td.lbl{text-align:right}tfoot td.val{text-align:right;font-size:13.5px}
      tfoot tr{background:#f3f4f6}
      .obs-t{font-size:11px;letter-spacing:.8px;color:#8a93a3;text-transform:uppercase;font-weight:700;margin-bottom:8px}
      .obs{border:1px solid ${NAVY}33;border-radius:8px;padding:16px;min-height:70px;color:#333;font-size:12.5px}
      .sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:120px}
      .sign .c{text-align:center}
      .sign .line{border-top:1px solid #9aa2b1;margin-bottom:8px}
      .sign .lbl{font-size:11px;color:#5b6472}
      .foot{text-align:center;color:#aab0bd;font-size:10px;margin-top:60px}
      @media print{body{padding:24px 30px}@page{margin:14mm}}
    </style></head><body>
      <div class="head">${logo}<div><h1>${esc(company.name || "")}</h1><div class="nif">NIF: ${esc(company.nif || "—")}</div></div></div>
      <div class="rule"></div>
      <div class="title"><h2>REQUISIÇÃO DE FUNDO</h2><div class="ref">Referência: ${esc(r.number)}</div></div>
      <div class="band">
        <div><div class="k">Data</div><div class="v">${esc(r.date)}</div></div>
        <div><div class="k">Departamento</div><div class="v">${esc(r.department || "—")}</div></div>
        <div><div class="k">Requisitante</div><div class="v">${esc(r.requester)}</div></div>
      </div>
      <table>
        <thead><tr><th class="c">Nº</th><th>Descrição</th><th class="c">Qtd</th><th class="r">Valor Unit. (AOA)</th><th class="r">Total (AOA)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3"></td><td class="lbl">TOTAL GERAL</td><td class="val">${fmtAOA(r.amount)}</td></tr></tfoot>
      </table>
      <div class="obs-t">Observação</div>
      <div class="obs">${esc(r.purpose || "")}</div>
      <div class="sign">
        <div class="c"><div class="line"></div><div class="lbl">Elaborado por (Assinatura)</div></div>
        <div class="c"><div class="line"></div><div class="lbl">Requisitante</div></div>
        <div class="c"><div class="line"></div><div class="lbl">Responsável Financeiro</div></div>
      </div>
      <div class="foot">${esc(r.number)} · Gerado por ZeroMaka</div>
    </body></html>`;

    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentWindow!.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); setTimeout(() => frame.remove(), 1200); }, 350);
  };

  const STATUS = {
    pendente: { label: "Pendente", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: Clock },
    aprovado: { label: "Aprovada", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    reprovado: { label: "Reprovada", cls: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle }
  } as const;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Requisições de fundos</h1>
          <p className="text-sm text-ink-400 mt-1">Para compras sem fatura — com itens, aprovação e PDF para imprimir e assinar.</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={15} /> Nova requisição</button>
      </header>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Pendente de aprovação</div>
          <div className="mt-1 font-display text-xl text-yellow-400">{fmtKz(pendingTotal)}</div>
        </div>
        <FileSignature className="text-ink-600" size={28} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {([["all", "Todas"], ["pendente", "Pendentes"], ["aprovado", "Aprovadas"], ["reprovado", "Reprovadas"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${filter === v ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>{l}</button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((r) => {
          const S = STATUS[r.status]; const SIcon = S.icon;
          const nItems = r.items?.length || 1;
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] text-maka-400">{r.number}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${S.cls}`}><SIcon size={11} /> {S.label}</span>
                    {r.department && <span className="text-[11px] text-ink-500">· {r.department}</span>}
                  </div>
                  <p className="mt-1.5 text-sm text-ink-200">{r.items?.length ? r.items.map((i) => i.description).join(", ") : r.purpose}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-ink-400 max-w-md">
                    <span>Requisitante: <span className="text-ink-200">{r.requester}</span></span>
                    <span>Responsável: <span className="text-ink-200">{r.approver}</span></span>
                    <span>{nItems} {nItems === 1 ? "item" : "itens"}</span>
                    <span>Data: <span className="text-ink-200">{fmtDate(r.date)}</span></span>
                  </div>
                  {r.status === "reprovado" && r.reason && <p className="mt-2 text-[12px] text-red-400">Motivo: {r.reason}</p>}
                </div>
                <div className="text-right shrink-0"><div className="font-display text-lg">{fmtKz(r.amount)}</div></div>
              </div>
              <div className="mt-3 pt-3 border-t border-ink-800 flex gap-2 justify-end flex-wrap">
                {r.status === "pendente" && (
                  <>
                    <button onClick={() => deleteRequisition(r.id)} className="btn-ghost text-ink-400 hover:text-red-300"><Trash2 size={14} /> Apagar</button>
                    <button onClick={() => openEdit(r)} className="btn-ghost"><Pencil size={14} /> Editar</button>
                    <button onClick={() => { setRejecting(r); setReason(""); }} className="btn-ghost text-red-300 border-red-500/30 hover:bg-red-500/10"><XCircle size={14} /> Reprovar</button>
                    <button onClick={() => { setApproving(r); setPayAcc(accounts[0]?.id ?? ""); }} className="btn-primary"><CheckCircle2 size={14} /> Aprovar</button>
                  </>
                )}
                {r.status === "aprovado" && (
                  <button onClick={() => printReq(r)} className="btn-primary"><Printer size={14} /> Imprimir / PDF</button>
                )}
                {r.status === "reprovado" && (
                  <button onClick={() => printReq(r)} className="btn-ghost"><Printer size={14} /> Ver PDF</button>
                )}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="card p-8 text-center text-sm text-ink-500">Nenhuma requisição neste filtro.</div>}
      </div>

      {show && (
        <Modal title={editing ? "Editar requisição" : "Nova requisição de fundos"} onClose={() => setShow(false)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Departamento</label>
                <input className="input" list="dept-dl" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
                <datalist id="dept-dl"><option value="Comercial" /><option value="Cozinha" /><option value="Logística" /><option value="Administração" /><option value="Operações" /></datalist>
              </div>
              <div><label className="label">Requisitante</label><input className="input" placeholder="Quem elabora" value={f.requester} onChange={(e) => setF({ ...f, requester: e.target.value })} /></div>
              <div><label className="label">Responsável Financeiro</label><input className="input" value={f.approver} onChange={(e) => setF({ ...f, approver: e.target.value })} /></div>
            </div>

            <div>
              <label className="label">Itens</label>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_70px_110px_92px_28px] gap-2 text-[10px] uppercase tracking-wider text-ink-500 font-bold px-0.5">
                  <span>Descrição</span><span>Qtd</span><span>Valor Unit.</span><span className="text-right">Total</span><span></span>
                </div>
                {f.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_110px_92px_28px] gap-2 items-center">
                    <input className="input" placeholder="Descrição do item" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                    <input className="input" type="number" min="0" step="0.01" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
                    <input className="input" type="number" min="0" placeholder="0" value={it.unitPrice || ""} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} />
                    <div className="text-right text-[12px] font-mono text-ink-300 truncate">{fmtKz((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</div>
                    <button onClick={() => removeItem(i)} className="text-ink-500 hover:text-red-400 flex justify-center" disabled={f.items.length === 1}><Trash size={15} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addItem} className="btn-ghost w-full justify-center mt-2"><Plus size={14} /> Adicionar item</button>
              <div className="flex justify-between items-center mt-3 px-1">
                <span className="text-[12px] text-ink-400 uppercase tracking-wider font-bold">Total Geral</span>
                <span className="font-display text-lg text-maka-400">{fmtKz(formTotal)}</span>
              </div>
            </div>

            <div><label className="label">Observação</label><textarea className="input" rows={2} placeholder="Ex.: Compra feita no mercado do trinta" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Categoria (para o lançamento)</label><select className="input" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label className="label">Data</label><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button onClick={submit} className="btn-primary w-full justify-center">{editing ? "Guardar alterações" : "Emitir requisição"}</button>
          </div>
        </Modal>
      )}

      {approving && (
        <Modal title="Aprovar requisição" onClose={() => setApproving(null)}>
          <p className="text-sm text-ink-300">Aprovar <span className="font-semibold">{fmtKz(approving.amount)}</span> ({approving.number}) para <span className="font-semibold">{approving.requester}</span>. Ao confirmar, a saída é lançada e a requisição fica pronta para imprimir.</p>
          <div className="mt-4"><label className="label">Conta que paga</label><select className="input" value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmtKz(a.currentBalance)}</option>)}</select></div>
          <div className="mt-5 flex gap-2 justify-end"><button onClick={() => setApproving(null)} className="btn-ghost">Cancelar</button><button onClick={() => { approveRequisition(approving.id, payAcc); setApproving(null); }} className="btn-primary">Confirmar aprovação</button></div>
        </Modal>
      )}

      {rejecting && (
        <Modal title="Reprovar requisição" onClose={() => setRejecting(null)}>
          <label className="label">Motivo da reprovação</label>
          <textarea className="input" rows={3} placeholder="Explica porquê" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-5 flex gap-2 justify-end"><button onClick={() => setRejecting(null)} className="btn-ghost">Cancelar</button><button onClick={() => { rejectRequisition(rejecting.id, reason.trim() || "Sem motivo indicado"); setRejecting(null); }} className="btn-primary bg-red-500 hover:bg-red-400">Reprovar</button></div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={`card w-full p-6 max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between mb-5"><h3 className="font-display text-lg">{title}</h3><button onClick={onClose} className="text-ink-400 hover:text-white"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}
