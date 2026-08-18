"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore, OrgMember, OrgInvite, MemberRole } from "@/lib/store";
import { fmtDate, REGIMES, TaxRegime, CommissionMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import DangerZone from "@/components/DangerZone";
import {
  Building2, Building, Users, ScrollText, Plus, X, Trash2, ShieldCheck, Check,
  Upload, Percent, BookLock, RefreshCw, AlertTriangle, Loader2, Archive, Mail, Clock,
} from "lucide-react";

type Tab = "empresas" | "perfil" | "equipa" | "governanca" | "auditoria" | "perigo";
const TABS: Tab[] = ["empresas", "perfil", "equipa", "governanca", "auditoria", "perigo"];

// O que cada papel pode fazer, em linguagem de dono de negócio. Espelha
// user_org_ids / user_writable_org_ids / user_admin_org_ids no SQL — se
// aqueles mudarem, isto tem de mudar também.
const ROLE_INFO: Record<string, { label: string; desc: string; tone: string }> = {
  owner: { label: "Proprietário", desc: "Controlo total. Não pode ser removido nem rebaixado.", tone: "bg-maka-500/15 text-maka-300 border-maka-500/30" },
  admin: { label: "Administrador", desc: "Tudo, incluindo gerir equipa, corrigir saldos e reverter movimentos.", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  finance: { label: "Financeiro", desc: "Lança e regista movimentos, mas não gere equipa nem reverte.", tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  member: { label: "Membro", desc: "Só leitura (papel antigo, equivalente a Consulta).", tone: "bg-ink-800 text-ink-300 border-ink-700" },
  viewer: { label: "Consulta", desc: "Vê tudo, não altera nada.", tone: "bg-ink-800 text-ink-300 border-ink-700" },
  // Papéis de âmbito estreito — cada um só vê e altera o que está descrito
  // aqui, nada de financeiro fora disso (sem dashboards, saldos, relatórios
  // nem dívidas de outras áreas). Espelha exatamente a matriz de permissões
  // em role_resource_permissions.
  requisitante: { label: "Requisitante", desc: "Cria e acompanha requisições de fundos. Não vê contas, saldos nem relatórios.", tone: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  aprovador: { label: "Aprovador", desc: "Aprova ou rejeita requisições pendentes. Nunca desembolsa — isso continua a exigir financeiro ou administrador.", tone: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  cobrador: { label: "Cobrador", desc: "Vê e recebe pagamentos das contas a receber. Não vê despesas nem contas a pagar.", tone: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  pagador: { label: "Pagador", desc: "Vê e regista pagamentos a fornecedores. Não vê receitas nem cobranças.", tone: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  rh: { label: "Recursos Humanos", desc: "Gere empréstimos e adiantamentos a funcionários. Não vê vendas nem dívidas de clientes/fornecedores.", tone: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  caixa: { label: "Operador de caixa", desc: "Vê contas e lança movimentos. Não vê relatórios, dívidas nem reservas.", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  contabilista: { label: "Contabilista", desc: "Vê tudo o que é financeiro para fechar contas e exportar. Nunca lança, gere equipa nem reverte.", tone: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  auditor: { label: "Auditor", desc: "Vê tudo, incluindo o registo de auditoria. Nunca altera nada — nem o contabilista vê a auditoria.", tone: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  convidado_temp: { label: "Convidado temporário", desc: "Sem acesso a nada por omissão — ajusta-se caso a caso. Pode ter uma data de expiração.", tone: "bg-ink-800 text-ink-400 border-ink-700" },
};

// As descrições completas (para o painel "o que cada permissão dá") ficam a
// cargo de ROLE_INFO acima; esta lista só define que opções aparecem nos
// dois seletores (convidar e mudar papel) — sempre as mesmas, e sempre sem
// 'owner' nem 'member' (legado, não se atribui de novo).
const ASSIGNABLE_ROLES: MemberRole[] = [
  "admin", "finance", "viewer",
  "requisitante", "aprovador", "cobrador", "pagador", "rh", "caixa", "contabilista", "auditor", "convidado_temp",
];

type AuditRow = {
  id: string; action: string; table_name: string; created_at: string;
  user_id: string | null; user_name: string; old_data?: unknown; new_data?: unknown;
};
type Closure = { id: string; period_start: string; period_end: string; status: "open" | "closed" | "reopened"; closed_at?: string; note?: string };

const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const monthEnd = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().slice(0, 10); };

export default function AdministracaoPage() {
  const {
    orgId, organizations, switchOrganization, company, updateCompany,
    addOrganization, listMembers, addMember, changeMemberRole, removeMember, transferOwnership, archiveOrganization,
    listInvites, createInvite, revokeInvite,
  } = useStore();
  const sb = useMemo(() => createClient(), []);

  const myRole = organizations.find(o => o.id === orgId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (TABS as string[]).includes(t || "") ? (t as Tab) : "empresas";
  });

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

  // ---- Perfil da empresa ----
  const [pfName, setPfName] = useState(company.name);
  const [pfNif, setPfNif] = useState(company.nif);
  const [pfAddress, setPfAddress] = useState(company.address);
  const [pfPhone, setPfPhone] = useState(company.phone);
  const [pfEmail, setPfEmail] = useState(company.email || "");
  const [pfRegime, setPfRegime] = useState<TaxRegime>(company.regime);
  const [pfLogo, setPfLogo] = useState(company.logo);
  const [pfPaysCommercial, setPfPaysCommercial] = useState(company.commissions.paysCommercial);
  const [pfMembers, setPfMembers] = useState<CommissionMember[]>(company.commissions.members);
  const [pfPaysClients, setPfPaysClients] = useState(company.commissions.paysClients);
  const [pfClientPercent, setPfClientPercent] = useState(String(company.commissions.clientPercent || ""));
  const [pfClientNote, setPfClientNote] = useState(company.commissions.clientNote);
  const [pfSaving, setPfSaving] = useState(false);
  const [pfSaved, setPfSaved] = useState(false);

  // Ressincroniza o formulário ao trocar de organização — sem isto, trocar
  // de empresa na aba Empresas e depois abrir Perfil mostrava dados da
  // empresa anterior, porque o estado local só é semeado uma vez.
  useEffect(() => {
    setPfName(company.name); setPfNif(company.nif); setPfAddress(company.address);
    setPfPhone(company.phone); setPfEmail(company.email || ""); setPfRegime(company.regime);
    setPfLogo(company.logo);
    setPfPaysCommercial(company.commissions.paysCommercial); setPfMembers(company.commissions.members);
    setPfPaysClients(company.commissions.paysClients); setPfClientPercent(String(company.commissions.clientPercent || ""));
    setPfClientNote(company.commissions.clientNote);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPfLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setPfLogo(r.result as string); r.readAsDataURL(f);
  };
  const addPfMember = () => setPfMembers((m) => [...m, { id: "m" + Date.now(), name: "", percent: 0 }]);
  const setPfMember = (id: string, patch: Partial<CommissionMember>) => setPfMembers((m) => m.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removePfMember = (id: string) => setPfMembers((m) => m.filter((x) => x.id !== id));

  const savePerfil = () => {
    setPfSaving(true); setPfSaved(false);
    setTimeout(() => {
      updateCompany({
        name: pfName, nif: pfNif, address: pfAddress, phone: pfPhone, email: pfEmail, regime: pfRegime, logo: pfLogo,
        commissions: {
          paysCommercial: pfPaysCommercial,
          members: pfMembers.filter((m) => m.name.trim()).map((m) => ({ ...m, percent: Number(m.percent) || 0 })),
          paysClients: pfPaysClients, clientPercent: Number(pfClientPercent) || 0, clientNote: pfClientNote,
        }
      });
      setPfSaving(false); setPfSaved(true); setTimeout(() => setPfSaved(false), 2500);
    }, 500);
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
    // A Zona de perigo também precisa da lista de membros (select de
    // "transferir propriedade") — reaproveita o mesmo estado em vez de
    // duplicar a carga.
    if ((tab === "equipa" || tab === "perigo") && orgId) void loadMembers();
  }, [tab, orgId, loadMembers]);

  // ---- Convite por email ----
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("viewer");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState("");

  const loadInvites = useCallback(async () => {
    setInvites(await listInvites());
  }, [listInvites]);

  useEffect(() => {
    if (tab === "equipa" && orgId) void loadInvites();
  }, [tab, orgId, loadInvites]);

  const submitInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true); setInviteErr("");
    const e = await createInvite(inviteEmail.trim(), inviteRole);
    setInviteBusy(false);
    if (e) { setInviteErr(e); return; }
    setShowInvite(false); setInviteEmail(""); setInviteRole("viewer");
    await loadInvites();
  };

  const doRevokeInvite = async (inviteId: string) => {
    const e = await revokeInvite(inviteId);
    if (!e) await loadInvites();
  };

  // ---- Transferir propriedade ----
  const transferCandidates = members.filter(m => m.role !== "owner");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferConfirm, setTransferConfirm] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferErr, setTransferErr] = useState("");
  const transferTarget = members.find(m => m.userId === transferTargetId);
  const transferTargetLabel = transferTarget?.name || transferTarget?.email || "";
  const transferMatches = !!transferTargetLabel && transferConfirm.trim().toLowerCase() === transferTargetLabel.trim().toLowerCase();

  const doTransfer = async () => {
    if (!transferTargetId || !transferMatches) return;
    setTransferBusy(true); setTransferErr("");
    const e = await transferOwnership(transferTargetId);
    setTransferBusy(false);
    if (e) { setTransferErr(e); return; }
    setShowTransfer(false); setTransferConfirm(""); setTransferTargetId("");
    await loadMembers();
  };

  // ---- Arquivar organização ----
  // A confirmação compara com organizations.name (mesmo padrão do
  // DangerZone existente) — pode diferir do nome comercial em company.name.
  const [orgTrueName, setOrgTrueName] = useState("");
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    sb.from("organizations").select("name").eq("id", orgId).single()
      .then(({ data }) => { if (!cancelled && data?.name) setOrgTrueName(data.name); });
    return () => { cancelled = true; };
  }, [orgId, sb]);

  const [showArchive, setShowArchive] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState("");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveErr, setArchiveErr] = useState("");
  const archiveMatches = !!orgTrueName && archiveConfirm.trim().toLowerCase() === orgTrueName.trim().toLowerCase();

  const doArchive = async () => {
    if (!archiveMatches) return;
    setArchiveBusy(true); setArchiveErr("");
    const e = await archiveOrganization(archiveConfirm.trim());
    setArchiveBusy(false);
    if (e) { setArchiveErr(e); return; }
    setShowArchive(false); setArchiveConfirm("");
  };

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

  // ---- Governança (fecho de período) ----
  const [gStart, setGStart] = useState(monthStart());
  const [gEnd, setGEnd] = useState(monthEnd());
  const [closure, setClosure] = useState<Closure | null>(null);
  const [gNote, setGNote] = useState("");
  const [gMessage, setGMessage] = useState("");
  const [gLoading, setGLoading] = useState(false);

  const loadClosure = useCallback(async () => {
    if (!orgId) return;
    setGLoading(true); setGMessage("");
    const { data, error } = await sb.from("accounting_period_closures").select("*")
      .eq("organization_id", orgId).eq("period_start", gStart).eq("period_end", gEnd).maybeSingle();
    setClosure(data as Closure | null);
    if (error) setGMessage(error.message);
    setGLoading(false);
  }, [orgId, gStart, gEnd, sb]);

  useEffect(() => { if (tab === "governanca") void loadClosure(); }, [tab, loadClosure]);

  const closePeriod = async () => {
    if (!orgId) return;
    const { error } = await sb.rpc("close_accounting_period", { p_org_id: orgId, p_start: gStart, p_end: gEnd, p_note: gNote.trim() || null });
    if (error) setGMessage(error.message); else { setGNote(""); await loadClosure(); }
  };
  const reopenPeriod = async () => {
    if (!orgId) return;
    const { error } = await sb.rpc("reopen_accounting_period", { p_org_id: orgId, p_start: gStart, p_end: gEnd, p_note: gNote.trim() || null });
    if (error) setGMessage(error.message); else { setGNote(""); await loadClosure(); }
  };

  // ---- Auditoria ----
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditErr, setAuditErr] = useState("");

  useEffect(() => {
    if (tab !== "auditoria" || !orgId) return;
    let cancelled = false;
    setAudit(null); setAuditErr("");
    (async () => {
      const { data, error } = await sb.rpc("get_organization_audit", { p_org_id: orgId, p_limit: 200 });
      if (cancelled) return;
      if (error) setAuditErr(error.message); else { setAudit((data as AuditRow[]) || []); setAuditErr(""); }
    })();
    return () => { cancelled = true; };
  }, [tab, orgId, sb]);

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
        <h1 className="h-page">Administração</h1>
        <p className="text-sm text-ink-400 mt-1">
          Empresas, perfil, equipa, governança e histórico — sempre no contexto de <strong>{company.name || "esta empresa"}</strong>.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {([
          ["empresas", "Empresas", Building2],
          ["perfil", "Perfil", Building],
          ["equipa", "Equipa", Users],
          ["governanca", "Governança", BookLock],
          ["auditoria", "Auditoria", ScrollText],
          ["perigo", "Zona de perigo", AlertTriangle],
        ] as const).map(([v, label, Icon]) => (
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

      {tab === "perfil" && (
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-ink-400">Estes dados alimentam as faturas, os documentos impressos e o cálculo de impostos.</p>

          <div className="card p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl border border-ink-700 bg-ink-950 flex items-center justify-center overflow-hidden shrink-0">
                {pfLogo ? <img src={pfLogo} alt="logo" className="h-full w-full object-cover" /> : <Building2 className="text-ink-600" size={26} />}
              </div>
              <div>
                <label className="btn-ghost cursor-pointer"><Upload size={15} /> Carregar logótipo<input type="file" accept="image/*" onChange={onPfLogo} className="hidden" /></label>
                <p className="text-[11px] text-ink-500 mt-1.5">Aparece nas requisições e relatórios exportados.</p>
              </div>
            </div>

            <div><label className="label">Nome da empresa</label><input className="input" value={pfName} onChange={(e) => setPfName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">NIF</label><input className="input" value={pfNif} onChange={(e) => setPfNif(e.target.value)} /></div>
              <div><label className="label">Telefone</label><input className="input" value={pfPhone} onChange={(e) => setPfPhone(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Endereço</label><input className="input" value={pfAddress} onChange={(e) => setPfAddress(e.target.value)} /></div>
              <div><label className="label">E-mail</label><input className="input" value={pfEmail} onChange={(e) => setPfEmail(e.target.value)} /></div>
            </div>

            <div>
              <label className="label">Regime tributário</label>
              <div className="space-y-2">
                {(Object.keys(REGIMES) as TaxRegime[]).map((r) => (
                  <button key={r} onClick={() => setPfRegime(r)} className={`w-full text-left rounded-lg border p-3 transition-colors ${pfRegime === r ? "border-maka-500 bg-maka-500/10" : "border-ink-700 hover:border-ink-500"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{REGIMES[r].label}</span>
                      <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${pfRegime === r ? "bg-maka-500 text-onbrand" : "bg-ink-800 text-ink-300"}`}>{REGIMES[r].tax}</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-500 mt-2">O imposto fica contido no valor da fatura (por dentro) e serve de referência no apuramento — Geral 14%, Simplificado 7%, Exclusão 1%.</p>
            </div>
          </div>

          <div className="card p-6 space-y-5">
            <div className="flex items-center gap-2"><Percent size={17} className="text-maka-400" /><h2 className="font-display text-lg">Comissões</h2></div>

            <div className="rounded-lg border border-ink-700 p-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium flex items-center gap-2"><Users size={15} className="text-ink-400" /> Paga comissão ao departamento comercial?</span>
                <input type="checkbox" checked={pfPaysCommercial} onChange={(e) => setPfPaysCommercial(e.target.checked)} className="h-4 w-4 accent-maka-500" />
              </label>
              {pfPaysCommercial && (
                <div className="mt-4 space-y-2">
                  {pfMembers.map((m) => (
                    <div key={m.id} className="flex gap-2 items-center">
                      <input className="input flex-1" placeholder="Nome do membro" value={m.name} onChange={(e) => setPfMember(m.id, { name: e.target.value })} />
                      <div className="relative w-24">
                        <input className="input pr-6" type="number" placeholder="0" value={m.percent || ""} onChange={(e) => setPfMember(m.id, { percent: Number(e.target.value) })} />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 text-sm">%</span>
                      </div>
                      <button onClick={() => removePfMember(m.id)} className="text-ink-500 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <button onClick={addPfMember} className="btn-ghost w-full justify-center"><Plus size={14} /> Adicionar membro</button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-ink-700 p-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium">Paga comissão a clientes / parceiros?</span>
                <input type="checkbox" checked={pfPaysClients} onChange={(e) => setPfPaysClients(e.target.checked)} className="h-4 w-4 accent-maka-500" />
              </label>
              {pfPaysClients && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Percentagem por venda</label>
                    <div className="relative"><input className="input pr-6" type="number" placeholder="0" value={pfClientPercent} onChange={(e) => setPfClientPercent(e.target.value)} /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 text-sm">%</span></div>
                  </div>
                  <div><label className="label">Nota / valor mensal</label><input className="input" placeholder="Ex.: 50.000 Kz/mês" value={pfClientNote} onChange={(e) => setPfClientNote(e.target.value)} /></div>
                </div>
              )}
              <p className="text-[11px] text-ink-500 mt-3">A configuração fica guardada. O lançamento automático destas comissões como saída chega na Fase 2.</p>
            </div>
          </div>

          <button onClick={savePerfil} disabled={pfSaving} className="btn-primary w-full justify-center disabled:opacity-60">
            {pfSaving ? <><Loader2 size={15} className="animate-spin" /> A guardar…</> : pfSaved ? "Guardado com sucesso!" : "Guardar definições"}
          </button>
        </div>
      )}

      {tab === "equipa" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-ink-400">Quem tem acesso a <strong>{company.name || "esta empresa"}</strong> e com que permissões.</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowInvite(true); setInviteErr(""); }} className="btn-ghost"><Mail size={15} /> Convidar por email</button>
              <button onClick={() => { setShowAdd(true); setErr(""); }} className="btn-primary"><Plus size={15} /> Adicionar por conta existente</button>
            </div>
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
                        {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
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

          {invites.length > 0 && (
            <div className="card divide-y divide-ink-800">
              <div className="px-4 py-3 text-[12px] font-semibold text-ink-400 flex items-center gap-2">
                <Clock size={14} /> Convites pendentes
              </div>
              {invites.map(i => {
                const info = ROLE_INFO[i.role] || { label: i.role, desc: "", tone: "bg-ink-800 text-ink-300 border-ink-700" };
                return (
                  <div key={i.id} className="p-4 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{i.email}</div>
                      <div className="text-[11px] text-ink-500 truncate">Convidado a {fmtDate(i.createdAt.slice(0, 10))} · expira a {fmtDate(i.expiresAt.slice(0, 10))}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${info.tone}`}>{info.label}</span>
                    <button onClick={() => void doRevokeInvite(i.id)} className="text-ink-500 hover:text-red-400 shrink-0" title="Revogar convite">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card p-4">
            <div className="text-[12.5px] text-ink-400 font-medium mb-2">O que cada permissão dá</div>
            <div className="space-y-1.5">
              {ASSIGNABLE_ROLES.map(r => (
                <div key={r} className="text-[12px] text-ink-400">
                  <span className="text-ink-200 font-medium">{ROLE_INFO[r].label}</span> — {ROLE_INFO[r].desc}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-400 mt-3">
              Atenção: Administrador, Financeiro e Consulta veem sempre os saldos, faturas e contactos desta empresa — a diferença está no que podem alterar. As permissões de âmbito estreito (Requisitante, Cobrador, Pagador...) já não veem tudo — só o que está descrito acima.
            </p>
          </div>
        </div>
      )}

      {tab === "governanca" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-400">Fecha um período contabilístico para bloquear novos lançamentos com data dentro dele.</p>
          <div className="card p-5">
            <div className="flex items-center gap-2 font-semibold mb-4"><BookLock size={17} className="text-maka-400" /> Fecho do período</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Início</label><input className="input" type="date" value={gStart} onChange={e => setGStart(e.target.value)} /></div>
              <div><label className="label">Fim</label><input className="input" type="date" value={gEnd} onChange={e => setGEnd(e.target.value)} /></div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <div className={`text-sm flex items-center gap-2 ${closure?.status === "closed" ? "text-red-300" : closure?.status === "reopened" ? "text-amber-300" : "text-emerald-300"}`}>
                <span className="h-2 w-2 rounded-full bg-current" /> Estado: {closure?.status === "closed" ? "Fechado" : closure?.status === "reopened" ? "Reaberto" : "Aberto"}
              </div>
              <button className="btn-ghost text-xs" onClick={() => void loadClosure()} disabled={gLoading}><RefreshCw size={13} className={gLoading ? "animate-spin" : ""} /> Atualizar</button>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input className="input flex-1" placeholder="Nota do fecho (opcional)" value={gNote} onChange={e => setGNote(e.target.value)} />
              {closure?.status === "closed"
                ? <button className="btn-ghost" onClick={() => void reopenPeriod()}>Reabrir período</button>
                : <button className="btn-primary" onClick={() => void closePeriod()}>Fechar período</button>}
            </div>
            {gMessage && <p className="text-sm text-red-400 mt-3">{gMessage}</p>}
            <p className="text-[11px] text-ink-500 mt-3">Quando fechado, o servidor bloqueia novos lançamentos com data dentro deste intervalo — esconder botões no frontend não chega. Reabrir fica registado na auditoria.</p>
          </div>
        </div>
      )}

      {tab === "auditoria" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-400">Últimas alterações registadas nesta empresa (até 200). O histórico não pode ser apagado.</p>
          {auditErr && <div className="card p-4 text-sm text-red-400">{auditErr}</div>}
          <div className="card divide-y divide-ink-800">
            {audit === null && !auditErr && <div className="p-8 text-center text-sm text-ink-500">A carregar…</div>}
            {audit?.map(a => (
              <details key={a.id} className="p-3 group">
                <summary className="cursor-pointer list-none flex items-center gap-3 text-sm">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    a.action === "DELETE" ? "bg-red-500/10 text-red-400"
                    : a.action === "INSERT" ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-sky-500/10 text-sky-400"}`}>{a.action}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-300">{a.table_name}</span>
                  <span className="text-[11px] text-ink-500 shrink-0">{a.user_name}</span>
                  <span className="text-[11px] text-ink-500 shrink-0">{new Date(a.created_at).toLocaleString("pt-PT")}</span>
                  <span className="text-ink-600 group-open:rotate-180 transition-transform shrink-0">⌄</span>
                </summary>
                <pre className="mt-3 rounded-lg bg-ink-950 p-3 text-[10px] text-ink-400 overflow-auto max-h-48">{JSON.stringify({ antes: a.old_data, depois: a.new_data }, null, 2)}</pre>
              </details>
            ))}
            {audit?.length === 0 && <div className="p-8 text-center text-sm text-ink-500">Sem registos ainda.</div>}
          </div>
        </div>
      )}

      {tab === "perigo" && (
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-ink-400">Ações irreversíveis (ou quase) sobre <strong>{company.name || "esta empresa"}</strong>. Só o proprietário pode executá-las.</p>

          <section className="card p-5">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[15px]">Transferir propriedade</h2>
                <p className="text-[12px] text-ink-500 mt-1 leading-snug">
                  Passa a ser <strong className="text-ink-300">administrador</strong> — manténs acesso a tudo, exceto
                  a poder voltar a transferir ou apagar a empresa. A pessoa escolhida tem de já ser membro.
                </p>
                {transferCandidates.length === 0 ? (
                  <p className="text-[12px] text-ink-500 mt-3">Não há mais ninguém na equipa para se tornar proprietário.</p>
                ) : (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <select className="input text-sm flex-1" value={transferTargetId}
                      onChange={e => setTransferTargetId(e.target.value)}>
                      <option value="">Escolhe uma pessoa…</option>
                      {transferCandidates.map(m => (
                        <option key={m.userId} value={m.userId}>{m.name || m.email || m.userId} — {ROLE_INFO[m.role]?.label || m.role}</option>
                      ))}
                    </select>
                    <button onClick={() => { setShowTransfer(true); setTransferConfirm(""); setTransferErr(""); }}
                      disabled={!transferTargetId}
                      className="rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 shrink-0">
                      Transferir
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <DangerZone />

          <section className="card border-red-500/40 p-5">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
                <Archive size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[15px] text-red-400">Arquivar organização</h2>
                <p className="text-[12px] text-ink-500 mt-1 leading-snug">
                  Esconde <strong>{orgTrueName || "esta organização"}</strong> do seletor e do Painel de Grupo, e bloqueia
                  novos lançamentos, faturas e alterações — nada é apagado, e continuas a poder consultar o histórico.
                  Reverter só é possível pedindo diretamente, ainda não há botão para isso.
                </p>
                <button onClick={() => { setShowArchive(true); setArchiveConfirm(""); setArchiveErr(""); }}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3 py-1.5 text-xs font-semibold transition-colors">
                  <Archive size={14} /> Arquivar organização
                </button>
              </div>
            </div>
          </section>
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

      {showInvite && (
        <Modal title="Convidar por email" onClose={() => setShowInvite(false)}>
          <div className="space-y-4">
            <p className="text-[11px] text-ink-400 bg-ink-800/60 rounded-lg p-3">
              A pessoa não precisa de já ter conta — recebe um email com um link para escolher o nome e a palavra-passe dela.
            </p>
            <div>
              <label className="label">Email da pessoa</label>
              <input className="input" type="email" placeholder="nome@empresa.ao" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Permissão</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as MemberRole)}>
                {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
              </select>
              <p className="text-[11px] text-ink-500 mt-1">{ROLE_INFO[inviteRole].desc}</p>
            </div>
            {inviteErr && <p className="text-sm text-red-400">{inviteErr}</p>}
            <button onClick={() => void submitInvite()} disabled={!inviteEmail.trim() || inviteBusy}
              className="btn-primary w-full justify-center disabled:opacity-40">
              {inviteBusy ? "A enviar…" : "Enviar convite"}
            </button>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Adicionar por conta existente" onClose={() => setShowAdd(false)}>
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
                {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
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

      {showTransfer && transferTarget && (
        <Modal title="Transferir propriedade" onClose={() => setShowTransfer(false)}>
          <p className="text-sm text-ink-300 mb-2">
            <strong>{transferTargetLabel}</strong> passa a proprietário de {company.name || "esta empresa"}.
            Tu passas a administrador.
          </p>
          <p className="text-[11px] text-ink-500 mb-4">Esta ação fica registada na auditoria e pode ser feita ao contrário mais tarde pelo novo proprietário.</p>
          <label className="label">
            Escreve <span className="text-amber-400">{transferTargetLabel}</span> para confirmar
          </label>
          <input className="input" value={transferConfirm} onChange={e => setTransferConfirm(e.target.value)}
            placeholder={transferTargetLabel} autoFocus autoComplete="off" />
          {transferErr && <p className="text-[12px] text-red-400 mt-2">{transferErr}</p>}
          <div className="flex gap-2 justify-end mt-5">
            <button onClick={() => setShowTransfer(false)} className="btn-ghost">Cancelar</button>
            <button onClick={() => void doTransfer()} disabled={!transferMatches || transferBusy}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40 transition-colors">
              {transferBusy ? "A transferir…" : "Transferir propriedade"}
            </button>
          </div>
        </Modal>
      )}

      {showArchive && (
        <Modal title="Arquivar organização" onClose={() => setShowArchive(false)}>
          <p className="text-sm text-ink-300 mb-2">
            <strong>{orgTrueName}</strong> deixa de aparecer no seletor de organizações e para de aceitar novos
            lançamentos, faturas ou alterações. Os dados ficam guardados e continuas a poder consultá-los.
          </p>
          <p className="text-[11px] text-ink-500 mb-4">
            Depois de arquivar, vais entrar automaticamente noutra organização (se tiveres mais alguma) ou seguir para
            criar uma nova.
          </p>
          <label className="label">
            Escreve <span className="text-red-400">{orgTrueName}</span> para confirmar
          </label>
          <input className="input" value={archiveConfirm} onChange={e => setArchiveConfirm(e.target.value)}
            placeholder={orgTrueName} autoFocus autoComplete="off" />
          {archiveErr && <p className="text-[12px] text-red-400 mt-2">{archiveErr}</p>}
          <div className="flex gap-2 justify-end mt-5">
            <button onClick={() => setShowArchive(false)} className="btn-ghost">Cancelar</button>
            <button onClick={() => void doArchive()} disabled={!archiveMatches || archiveBusy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40 transition-colors">
              {archiveBusy ? "A arquivar…" : "Arquivar organização"}
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
