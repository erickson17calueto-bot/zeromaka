"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore, OrgMember, MemberRole } from "@/lib/store";
import { fmtDate } from "@/lib/data";
import { Building2, Users, ScrollText, Plus, X, Trash2, ShieldCheck, Check } from "lucide-react";

type Tab = "empresas" | "equipa" | "auditoria";

// O que cada papel pode fazer, em linguagem de dono de negócio. Espelha
// user_org_ids / user_writable_org_ids / user_admin_org_ids no SQL — se
// aqueles mudarem, isto tem de mudar também.
const ROLE_INFO: Record<string, { label: string; desc: string; tone: string }> = {
  owner: { label: "Proprietário", desc: "Controlo total. Não pode ser removido nem rebaixado.", tone: "bg-maka-500/15 text-maka-300 border-maka-500/30" },
  admin: { label: "Administrador", desc: "Tudo, incluindo gerir equipa, corrigir saldos e reverter movimentos.", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  finance: { label: "Financeiro", desc: "Lança e regista movimentos, mas não gere equipa nem reverte.", tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  member: { label: "Membro", desc: "Só leitura (papel antigo, equivalente a Consulta).", tone: "bg-ink-800 text-ink-300 border-ink-700" },
  viewer: { label: "Consulta", desc: "Vê tudo, não altera nada.", tone: "bg-ink-800 text-ink-300 border-ink-700" },
};

type AuditRow = { id: string; action: string; table_name: string; created_at: string; user_id: string | null };

export default function AdministracaoPage() {
  const {
    orgId, organizations, switchOrganization, company,
    addOrganization, listMembers, addMember, changeMemberRole, removeMember,
  } = useStore();

  const myRole = organizations.find(o => o.id === orgId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [tab, setTab] = useState<Tab>("empresas");

  // ---- Empresas ----
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgCompany, setOrgCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submitNewOrg = async () => {
    if (!orgName.trim()) return;
    setBusy(true); setErr("");
    const e = await addOrganization(orgName.trim(), orgCompany.trim() || orgName.trim());
    setBusy(false);
    if (e) { setErr(e); return; }
    setShowNewOrg(false); setOrgName(""); setOrgCompany("");
  };

  // ---- Equipa ----
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("viewer");
  const [confirmRemove, setConfirmRemove] = useState<OrgMember | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    setMembers(await listMembers());
    setLoadingMembers(false);
  }, [listMembers]);

  useEffect(() => {
    if (tab === "equipa" && orgId) void loadMembers();
  }, [tab, orgId, loadMembers]);

  const submitAddMember = async () => {
    if (!newEmail.trim()) return;
    setBusy(true); setErr("");
    const e = await addMember(newEmail.trim(), newRole);
    setBusy(false);
    if (e) { setErr(e); return; }
    setShowAdd(false); setNewEmail(""); setNewRole("viewer");
    await loadMembers();
  };

  const doChangeRole = async (m: OrgMember, role: MemberRole) => {
    if (role === m.role) return;
    const e = await changeMemberRole(m.userId, role);
    if (!e) await loadMembers();
  };

  const doRemove = async () => {
    if (!confirmRemove) return;
    const e = await removeMember(confirmRemove.userId);
    setConfirmRemove(null);
    if (!e) await loadMembers();
  };

  // ---- Auditoria ----
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditErr, setAuditErr] = useState("");

  useEffect(() => {
    if (tab !== "auditoria" || !orgId) return;
    let cancelled = false;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const { data, error } = await createClient()
        .from("audit_logs")
        .select("id, action, table_name, created_at, user_id")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) setAuditErr(error.message); else { setAudit(data as AuditRow[]); setAuditErr(""); }
    })();
    return () => { cancelled = true; };
  }, [tab, orgId]);

  const memberName = useMemo(() => {
    const map = new Map(members.map(m => [m.userId, m.name || m.email || "Utilizador"]));
    return (id: string | null) => (id ? map.get(id) || "—" : "sistema");
  }, [members]);

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card p-8 text-center">
          <ShieldCheck className="mx-auto text-ink-600 mb-3" size={32} />
          <h1 className="font-display text-xl">Área restrita</h1>
          <p className="text-sm text-ink-400 mt-2">
            Só o proprietário ou um administrador desta empresa pode abrir a administração.
            O teu papel aqui é <strong>{ROLE_INFO[myRole || ""]?.label || myRole || "—"}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">Administração</h1>
        <p className="text-sm text-ink-400 mt-1">
          Empresas, equipa e histórico — sempre no contexto de <strong>{company.name || "esta empresa"}</strong>.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {([["empresas", "Empresas", Building2], ["equipa", "Equipa", Users], ["auditoria", "Auditoria", ScrollText]] as const).map(([v, label, Icon]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors flex items-center gap-1.5 ${tab === v ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-700 text-ink-400 hover:border-ink-500"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "empresas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-ink-400">
              {organizations.length} empresa{organizations.length !== 1 ? "s" : ""} · cada uma tem contas, movimentos e equipa próprios, totalmente separados.
            </p>
            <button onClick={() => { setShowNewOrg(true); setErr(""); }} className="btn-primary"><Plus size={15} /> Nova empresa</button>
          </div>

          <div className="card divide-y divide-ink-800">
            {organizations.map(o => {
              const active = o.id === orgId;
              return (
                <div key={o.id} className="p-4 flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-maka-500/10 text-maka-400" : "bg-ink-800 text-ink-400"}`}>
                    <Building2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {o.name}
                      {active && <span className="ml-2 text-[10px] text-maka-400 font-bold uppercase">a trabalhar aqui</span>}
                    </div>
                    <div className="text-[11px] text-ink-500">O teu papel: {ROLE_INFO[o.role]?.label || o.role}</div>
                  </div>
                  {!active && (
                    <button onClick={() => void switchOrganization(o.id)} className="btn-ghost text-sm shrink-0">Entrar</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "equipa" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-ink-400">Quem tem acesso a <strong>{company.name || "esta empresa"}</strong> e com que permissões.</p>
            <button onClick={() => { setShowAdd(true); setErr(""); }} className="btn-primary"><Plus size={15} /> Adicionar pessoa</button>
          </div>

          <div className="card divide-y divide-ink-800">
            {loadingMembers && <div className="p-8 text-center text-sm text-ink-500">A carregar…</div>}
            {!loadingMembers && members.map(m => {
              const info = ROLE_INFO[m.role] || { label: m.role, desc: "", tone: "bg-ink-800 text-ink-300 border-ink-700" };
              const isOwner = m.role === "owner";
              return (
                <div key={m.userId} className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.name || "Sem nome"}</div>
                    <div className="text-[11px] text-ink-500 truncate">{m.email || "sem email"}{m.createdAt ? ` · desde ${fmtDate(m.createdAt.slice(0, 10))}` : ""}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${info.tone}`}>{info.label}</span>
                  {isOwner ? (
                    <span className="text-[11px] text-ink-600 shrink-0">não editável</span>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <select className="input text-xs py-1 w-auto" value={m.role}
                        onChange={e => void doChangeRole(m, e.target.value as MemberRole)}>
                        <option value="admin">Administrador</option>
                        <option value="finance">Financeiro</option>
                        <option value="viewer">Consulta</option>
                        {m.role === "member" && <option value="member" disabled>Membro (antigo)</option>}
                      </select>
                      <button onClick={() => setConfirmRemove(m)} className="text-ink-500 hover:text-red-400" title="Remover da empresa">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!loadingMembers && members.length === 0 && (
              <div className="p-8 text-center text-sm text-ink-500">Ainda só tu tens acesso a esta empresa.</div>
            )}
          </div>

          <div className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 font-bold mb-2">O que cada permissão dá</div>
            <div className="space-y-1.5">
              {(["admin", "finance", "viewer"] as const).map(r => (
                <div key={r} className="text-[12px] text-ink-400">
                  <span className="text-ink-200 font-medium">{ROLE_INFO[r].label}</span> — {ROLE_INFO[r].desc}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-400 mt-3">
              Atenção: todas as permissões, incluindo Consulta, veem os saldos, faturas e contactos desta empresa. A diferença está no que podem alterar.
            </p>
          </div>
        </div>
      )}

      {tab === "auditoria" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-400">Últimas 50 alterações registadas nesta empresa. O histórico não pode ser apagado.</p>
          {auditErr && <div className="card p-4 text-sm text-red-400">{auditErr}</div>}
          <div className="card divide-y divide-ink-800">
            {audit === null && !auditErr && <div className="p-8 text-center text-sm text-ink-500">A carregar…</div>}
            {audit?.map(a => (
              <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  a.action === "DELETE" ? "bg-red-500/10 text-red-400"
                  : a.action === "INSERT" ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-sky-500/10 text-sky-400"}`}>{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-ink-300">{a.table_name}</span>
                <span className="text-[11px] text-ink-500 shrink-0">{memberName(a.user_id)}</span>
                <span className="text-[11px] text-ink-500 shrink-0">{new Date(a.created_at).toLocaleString("pt-PT")}</span>
              </div>
            ))}
            {audit?.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Sem registos ainda.</div>}
          </div>
        </div>
      )}

      {showNewOrg && (
        <Modal title="Nova empresa" onClose={() => setShowNewOrg(false)}>
          <div className="space-y-4">
            <p className="text-[11px] text-ink-500">
              Cria uma empresa separada, com contas, movimentos e equipa próprios. Nada é partilhado com as empresas que já tens.
            </p>
            <div>
              <label className="label">Nome da empresa</label>
              <input className="input" placeholder="Ex.: Blueaxis Trading" value={orgName} onChange={e => setOrgName(e.target.value)} />
            </div>
            <div>
              <label className="label">Nome comercial <span className="text-ink-500">(opcional)</span></label>
              <input className="input" placeholder="Se for diferente do nome acima" value={orgCompany} onChange={e => setOrgCompany(e.target.value)} />
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button onClick={() => void submitNewOrg()} disabled={!orgName.trim() || busy}
              className="btn-primary w-full justify-center disabled:opacity-40">
              {busy ? "A criar…" : "Criar e entrar"}
            </button>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Adicionar pessoa à equipa" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <p className="text-[11px] text-amber-400 bg-amber-500/10 rounded-lg p-3">
              A pessoa tem de já ter conta no ZeroMaka. Pede-lhe para criar conta primeiro em zeromaka.com e depois adiciona-a aqui pelo email que usou.
            </p>
            <div>
              <label className="label">Email da pessoa</label>
              <input className="input" type="email" placeholder="nome@empresa.ao" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Permissão</label>
              <select className="input" value={newRole} onChange={e => setNewRole(e.target.value as MemberRole)}>
                <option value="viewer">Consulta — vê tudo, não altera nada</option>
                <option value="finance">Financeiro — lança movimentos</option>
                <option value="admin">Administrador — controlo quase total</option>
              </select>
              <p className="text-[11px] text-ink-500 mt-1">{ROLE_INFO[newRole].desc}</p>
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button onClick={() => void submitAddMember()} disabled={!newEmail.trim() || busy}
              className="btn-primary w-full justify-center disabled:opacity-40">
              {busy ? "A adicionar…" : "Adicionar"}
            </button>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <Modal title="Remover da empresa" onClose={() => setConfirmRemove(null)}>
          <p className="text-sm text-ink-300 mb-2">
            <strong>{confirmRemove.name || confirmRemove.email}</strong> deixa de ter acesso a {company.name || "esta empresa"}.
          </p>
          <p className="text-[11px] text-ink-500 mb-4">
            A conta da pessoa continua a existir e os movimentos que registou não são apagados — só perde o acesso. Podes voltar a adicioná-la depois.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmRemove(null)} className="btn-ghost">Cancelar</button>
            <button onClick={() => void doRemove()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Remover</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
