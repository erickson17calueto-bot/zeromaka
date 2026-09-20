"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  LayoutDashboard, Wallet, ArrowLeftRight, FileText, ClipboardList, Landmark,
  Users, BarChart3, Trophy, Medal, HandCoins, Receipt, PiggyBank, RefreshCw,
  GitCompareArrows, TrendingUp, Paperclip, ShieldCheck, Wrench, FileSpreadsheet,
  PanelLeftClose, PanelLeftOpen, Menu, X, Tags, Layers, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import { ROUTES } from "@/lib/routes";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  { title: "Finanças", items: [
    { href: ROUTES.dashboard, label: "Visão geral", icon: LayoutDashboard },
    { href: "/app/contas", label: "Contas", icon: Wallet },
    { href: "/app/transacoes", label: "Movimentos", icon: ArrowLeftRight },
    { href: "/app/faturas", label: "A receber", icon: FileText, badge: "overdue" },
    { href: "/app/cobrancas", label: "Cobranças", icon: HandCoins, badge: "overdue" },
    { href: "/app/contas-a-pagar", label: "A pagar", icon: Receipt, badge: "payable" },
    { href: "/app/reservas", label: "Reservas", icon: PiggyBank },
    { href: "/app/recorrencias", label: "Recorrências", icon: RefreshCw },
    { href: "/app/reconciliacao", label: "Reconciliação", icon: GitCompareArrows },
    { href: "/app/planeamento", label: "Planeamento", icon: TrendingUp },
    { href: "/app/documentos", label: "Documentos e alertas", icon: Paperclip },
    { href: "/app/importacoes", label: "Importar ficheiros", icon: FileSpreadsheet },
    { href: "/app/governanca", label: "Governança", icon: ShieldCheck },
    { href: "/app/patrimonio", label: "Ativos e centros", icon: Wrench },
  ]},
  { title: "Operações", items: [
    { href: "/app/requisicoes", label: "Requisições", icon: ClipboardList, badge: "req" },
    { href: "/app/capital", label: "Capital dos sócios", icon: Landmark },
    { href: "/app/emprestimos", label: "Empréstimos e adiantamentos", icon: HandCoins },
    { href: "/app/contactos", label: "Contactos", icon: Users },
  ]},
  { title: "Análise", items: [
    { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
    { href: "/app/conquistas", label: "Conquistas", icon: Trophy },
    { href: "/app/ranking", label: "Ranking", icon: Medal },
  ]},
];

const ADMIN_SECTION: NavSection = { title: "Administração", items: [
  { href: "/app/administracao", label: "Empresas e equipa", icon: ShieldCheck },
]};

const NARROW_ROLE_SECTIONS: Partial<Record<string, NavSection[]>> = {
  requisitante: [{ title: "Requisições", items: [{ href: "/app/requisicoes", label: "Requisições", icon: ClipboardList }] }],
  aprovador: [{ title: "Requisições", items: [{ href: "/app/requisicoes", label: "Requisições", icon: ClipboardList, badge: "req" }] }],
  cobrador: [{ title: "Cobranças", items: [
    { href: "/app/faturas", label: "A receber", icon: FileText, badge: "overdue" },
    { href: "/app/cobrancas", label: "Cobranças", icon: HandCoins, badge: "overdue" },
    { href: "/app/contactos", label: "Contactos", icon: Users },
  ]}],
  pagador: [{ title: "Pagamentos", items: [
    { href: "/app/contas-a-pagar", label: "A pagar", icon: Receipt, badge: "payable" },
    { href: "/app/contactos", label: "Contactos", icon: Users },
  ]}],
  rh: [{ title: "Recursos Humanos", items: [
    { href: "/app/emprestimos", label: "Empréstimos e adiantamentos", icon: HandCoins },
    { href: "/app/contactos", label: "Contactos", icon: Users },
  ]}],
  caixa: [{ title: "Caixa", items: [
    { href: "/app/contas", label: "Contas", icon: Wallet },
    { href: "/app/transacoes", label: "Movimentos", icon: ArrowLeftRight },
    { href: "/app/requisicoes", label: "Requisições", icon: ClipboardList, badge: "disburse" },
  ]}],
  contabilista: [{ title: "Finanças", items: [
    { href: ROUTES.dashboard, label: "Visão geral", icon: LayoutDashboard },
    { href: "/app/transacoes", label: "Movimentos", icon: ArrowLeftRight },
    { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  ]}],
  auditor: [{ title: "Auditoria", items: [
    { href: ROUTES.dashboard, label: "Visão geral", icon: LayoutDashboard },
    { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  ]}],
};

const PRIMARY_ORDER = [
  ROUTES.dashboard,
  "/app/transacoes",
  "/app/faturas",
  "/app/contas-a-pagar",
  "/app/requisicoes",
  "/app/relatorios",
];

const COLLAPSED_KEY = "zeromaka_sidebar_collapsed";

export default function Sidebar() {
  const path = usePathname();
  const { profile, obligations, requisitions, logout, orgId, organizations, switchOrganization } = useStore();
  const currentOrg = organizations.find((organization) => organization.id === orgId);
  const isAdmin = currentOrg?.role === "owner" || currentOrg?.role === "admin";
  const narrowSections = currentOrg?.role ? NARROW_ROLE_SECTIONS[currentOrg.role] : undefined;
  const baseSections = narrowSections ?? (organizations.length > 1
    ? SECTIONS.map((section) => section.title === "Análise"
      ? { ...section, items: [{ href: "/app/grupo", label: "Painel de grupo", icon: Layers }, ...section.items] }
      : section)
    : SECTIONS);
  const visibleSections = isAdmin ? [...baseSections, ADMIN_SECTION] : baseSections;

  const [switching, setSwitching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isOverdue = (status: string) => status === "overdue" || status === "partial_overdue";
  const overdue = obligations.filter((item) => item.direction === "receivable" && isOverdue(item.financialStatus)).length;
  const payableOverdue = obligations.filter((item) => item.direction === "payable" && isOverdue(item.financialStatus)).length;
  const pendingReq = requisitions.filter((item) => item.status === "pendente").length;
  const awaitingDisbursement = requisitions.filter((item) => item.status === "aguardando_desembolso").length;
  const initials = profile.name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  const badgeValue = (kind?: string) => kind === "overdue" ? overdue
    : kind === "payable" ? payableOverdue
      : kind === "req" ? pendingReq
        : kind === "disburse" ? awaitingDisbursement
          : 0;

  const flatItems = visibleSections.flatMap((section) => section.items);
  const orderedPrimaryItems = PRIMARY_ORDER
    .map((href) => flatItems.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const remainingPrimaryItems = flatItems.filter((item) => !orderedPrimaryItems.some((candidate) => candidate.href === item.href));
  const primaryItems = [...orderedPrimaryItems, ...remainingPrimaryItems].slice(0, 6);
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const additionalGroups = visibleSections
    .map((section) => ({ ...section, items: section.items.filter((item) => !primaryHrefs.has(item.href)) }))
    .filter((section) => section.items.length > 0);
  const moreGroups = [...additionalGroups, { title: "Configuração", items: [{ href: "/app/categorias", label: "Categorias", icon: Tags }] }];
  const moreIsActive = moreGroups.some((section) => section.items.some((item) => item.href === path));

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1"); } catch { /* sem armazenamento */ }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [path]);

  useEffect(() => {
    const openMenu = () => setMobileOpen(true);
    window.addEventListener("zeromaka:open-menu", openMenu);
    return () => window.removeEventListener("zeromaka:open-menu", openMenu);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setMoreOpen(false);
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* sem armazenamento */ }
  };

  const navLink = (item: NavItem, active: boolean, compact = false) => {
    const Icon = item.icon;
    const count = badgeValue(item.badge);
    return (
      <Link key={item.href} href={item.href} title={collapsed && !compact ? item.label : undefined}
        className={`sidebar-link ${active ? "sidebar-link-active" : ""} ${collapsed && !compact ? "md:justify-center md:px-0" : ""}`}>
        <Icon size={16} className="shrink-0" />
        <span className={`min-w-0 flex-1 truncate ${collapsed && !compact ? "md:hidden" : ""}`}>{item.label}</span>
        {count > 0 && (
          <span className={`${collapsed && !compact ? "md:absolute md:right-1 md:top-1" : ""} rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400`}>
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <button onClick={() => setMobileOpen(true)} aria-label="Abrir menu"
        className="md:hidden fixed top-3 left-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-ink-800 bg-ink-950 text-ink-300 shadow-lg">
        <Menu size={18} />
      </button>

      {mobileOpen ? (
        <div onClick={() => setMobileOpen(false)} className="md:hidden fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
      ) : null}

      <aside className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-screen w-[224px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b0c11] px-3 py-3
        transition-transform duration-300 md:sticky md:top-0 md:transition-[width] ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        ${collapsed ? "md:w-[72px]" : "md:w-[224px]"}`}>
        <div className={`flex h-11 items-center gap-2.5 ${collapsed ? "md:justify-center" : "px-1"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-maka-500 font-display text-sm text-onbrand">Z</div>
          <div className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
            <div className="font-semibold leading-none tracking-tight">Zero<span className="text-maka-400">Maka</span></div>
            <div className="mt-1 text-[9px] uppercase tracking-[.16em] text-ink-600">Gestão financeira</div>
          </div>
          <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-white/[0.05] hover:text-ink-100 md:hidden">
            <X size={16} />
          </button>
        </div>

        {organizations.length > 1 ? (
          <div className={`mt-3 px-1 ${collapsed ? "md:hidden" : ""}`}>
            <label className="mb-1 block text-[9px] font-semibold uppercase tracking-[.14em] text-ink-600">Organização</label>
            <select aria-label="Organização ativa" className="input h-9 py-1.5 text-xs" value={orgId || ""} disabled={switching}
              onChange={async (event) => {
                const next = event.target.value;
                if (!next || next === orgId) return;
                setSwitching(true);
                await switchOrganization(next);
                setSwitching(false);
              }}>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </div>
        ) : null}

        <nav className="mt-5 flex-1 space-y-1" aria-label="Navegação principal">
          <div className={`px-2 pb-1 text-[9px] font-semibold uppercase tracking-[.16em] text-ink-600 ${collapsed ? "md:hidden" : ""}`}>Área de trabalho</div>
          {primaryItems.map((item) => navLink(item, path === item.href))}

          <div ref={moreRef} className="relative pt-1">
            <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-haspopup="menu"
              className={`sidebar-link w-full ${moreIsActive || moreOpen ? "sidebar-link-active" : ""} ${collapsed ? "md:justify-center md:px-0" : ""}`}>
              <MoreHorizontal size={17} className="shrink-0" />
              <span className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}>Mais</span>
            </button>

            {moreOpen ? (
              <div role="menu" className="sidebar-more-panel fixed bottom-20 left-3 right-3 z-[70] max-h-[68vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#13151d] p-3 shadow-2xl md:absolute md:bottom-0 md:left-full md:right-auto md:ml-3 md:w-[520px]">
                <div className="mb-2 flex items-center justify-between px-2 py-1">
                  <div>
                    <div className="text-sm font-semibold">Todas as áreas</div>
                    <div className="text-[11px] text-ink-500">Acessos usados com menos frequência</div>
                  </div>
                  <button type="button" onClick={() => setMoreOpen(false)} aria-label="Fechar" className="topbar-action"><X size={15} /></button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {moreGroups.map((section) => (
                    <section key={section.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                      <h2 className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-ink-600">{section.title}</h2>
                      <div className="space-y-0.5">
                        {section.items.map((item) => navLink(item, path === item.href, true))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="mt-3 border-t border-white/[0.07] pt-3">
          <AccountMenu name={profile.name} email={profile.email} initials={initials} collapsed={collapsed} onLogout={logout} />
          <button onClick={toggleCollapsed} title={collapsed ? "Expandir menu" : "Encolher menu"} aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
            className={`mt-1 hidden h-8 w-full items-center gap-2 rounded-lg px-2 text-[11px] text-ink-600 transition-colors hover:bg-white/[0.04] hover:text-ink-300 md:flex ${collapsed ? "justify-center" : ""}`}>
            {collapsed ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /><span>Encolher</span></>}
          </button>
        </div>
      </aside>
    </>
  );
}
