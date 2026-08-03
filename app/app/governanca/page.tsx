"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookLock, Check, ChevronDown, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/data";

type Closure = { id: string; period_start: string; period_end: string; status: "open" | "closed" | "reopened"; closed_at?: string; note?: string };
type Member = { user_id: string; role: string; name: string; phone?: string };
type Audit = { id: string; created_at: string; action: string; table_name: string; record_id?: string; old_data?: unknown; new_data?: unknown; user_name: string };
const roleLabels: Record<string, string> = { owner: "Proprietário", admin: "Administrador", finance: "Financeiro", viewer: "Consulta" };
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const monthEnd = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().slice(0, 10); };

export default function GovernancaPage() {
  const { orgId } = useStore();
  const supabase = useMemo(() => createClient(), []);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(monthEnd());
  const [closure, setClosure] = useState<Closure | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setMessage("");
    const [c, m, a] = await Promise.all([
      supabase.from("accounting_period_closures").select("*").eq("organization_id", orgId).eq("period_start", start).eq("period_end", end).maybeSingle(),
      supabase.rpc("list_organization_members", { p_org_id: orgId }),
      supabase.rpc("get_organization_audit", { p_org_id: orgId, p_limit: 80 }),
    ]);
    setClosure(c.data as Closure | null);
    if (Array.isArray(m.data)) setMembers(m.data as Member[]);
    if (Array.isArray(a.data)) setAudit(a.data as Audit[]);
    const error = c.error || m.error || a.error;
    if (error) setMessage(error.message);
    setLoading(false);
  }, [end, orgId, start, supabase]);
  useEffect(() => { load(); }, [load]);

  const closePeriod = async () => {
    if (!orgId) return;
    const { error } = await supabase.rpc("close_accounting_period", { p_org_id: orgId, p_start: start, p_end: end, p_note: note.trim() || null });
    if (error) setMessage(error.message); else { setNote(""); await load(); }
  };
  const reopenPeriod = async () => {
    if (!orgId) return;
    const { error } = await supabase.rpc("reopen_accounting_period", { p_org_id: orgId, p_start: start, p_end: end, p_note: note.trim() || null });
    if (error) setMessage(error.message); else { setNote(""); await load(); }
  };
  const changeRole = async (member: Member, role: string) => {
    if (!orgId || member.role === role) return;
    const { error } = await supabase.rpc("change_organization_member_role", { p_org_id: orgId, p_user_id: member.user_id, p_role: role });
    if (error) setMessage(error.message); else await load();
  };
  const statusLabel = closure?.status === "closed" ? "Fechado" : closure?.status === "reopened" ? "Reaberto" : "Aberto";

  return <div className="max-w-6xl mx-auto space-y-6">
    <header className="flex items-end justify-between flex-wrap gap-3"><div><div className="flex items-center gap-2 text-maka-400 text-sm font-semibold"><ShieldCheck size={17} /> Controlo e responsabilidade</div><h1 className="font-display text-2xl md:text-3xl tracking-tight mt-1">Governança</h1><p className="text-sm text-ink-400 mt-1">Permissões, fecho mensal e trilho de auditoria num só lugar.</p></div><button className="btn-ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar</button></header>

    <section className="card p-5"><div className="flex items-center gap-2 font-semibold mb-4"><BookLock size={17} className="text-maka-400" /> Fecho do período</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="label">Início</label><input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></div><div><label className="label">Fim</label><input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div></div><div className="mt-4 flex items-center justify-between gap-3 flex-wrap"><div className={`text-sm flex items-center gap-2 ${closure?.status === "closed" ? "text-red-300" : closure?.status === "reopened" ? "text-amber-300" : "text-emerald-300"}`}><span className="h-2 w-2 rounded-full bg-current" /> Estado: {statusLabel}</div><div className="text-xs text-ink-500">Só owner/admin podem fechar ou reabrir.</div></div><div className="mt-4 flex flex-col sm:flex-row gap-2"><input className="input flex-1" placeholder="Nota do fecho (opcional)" value={note} onChange={e => setNote(e.target.value)} />{closure?.status === "closed" ? <button className="btn-ghost" onClick={reopenPeriod}>Reabrir período</button> : <button className="btn-primary" onClick={closePeriod}>Fechar período</button>}</div><p className="text-[11px] text-ink-500 mt-3">Quando fechado, o servidor bloqueia novos lançamentos com data dentro deste intervalo. Reabrir fica registado na auditoria.</p></section>

    <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-5 items-start"><section className="card overflow-hidden"><div className="p-5 border-b border-ink-800"><div className="flex items-center gap-2 font-semibold"><UserCog size={16} className="text-maka-400" /> Membros e papéis</div><p className="text-xs text-ink-500 mt-1">As alterações são protegidas no servidor e ficam auditadas.</p></div>{members.length === 0 ? <div className="p-8 text-center text-sm text-ink-500">Sem membros carregados.</div> : <div className="divide-y divide-ink-800">{members.map(member => <div key={member.user_id} className="p-4 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-medium truncate">{member.name}</div><div className="text-xs text-ink-500 mt-1">{roleLabels[member.role] || member.role}</div></div>{member.role === "owner" ? <span className="text-xs text-maka-400">Protegido</span> : <select className="input text-xs w-36" value={member.role} onChange={e => changeRole(member, e.target.value)}><option value="admin">Administrador</option><option value="finance">Financeiro</option><option value="viewer">Consulta</option></select>}</div>)}</div>}</section>

      <section className="card overflow-hidden"><div className="p-5 border-b border-ink-800"><div className="flex items-center gap-2 font-semibold"><ChevronDown size={16} className="text-maka-400" /> Auditoria recente</div><p className="text-xs text-ink-500 mt-1">Alterações financeiras, permissões e fechos ficam visíveis para revisão.</p></div>{audit.length === 0 ? <div className="p-8 text-center text-sm text-ink-500">Ainda não há eventos de auditoria.</div> : <div className="divide-y divide-ink-800 max-h-[520px] overflow-y-auto">{audit.map(event => <details key={event.id} className="p-4 group"><summary className="cursor-pointer list-none flex justify-between gap-3"><div><div className="text-sm font-medium">{event.action} · {event.table_name}</div><div className="text-xs text-ink-500 mt-1">{event.user_name} · {fmtDate(event.created_at)}</div></div><span className="text-ink-600 group-open:rotate-180 transition-transform">⌄</span></summary><pre className="mt-3 rounded-lg bg-ink-950 p-3 text-[10px] text-ink-400 overflow-auto max-h-48">{JSON.stringify({ antes: event.old_data, depois: event.new_data }, null, 2)}</pre></details>)}</div>}</section></div>
    {message && <p className="text-sm text-red-400">{message}</p>}
  </div>;
}