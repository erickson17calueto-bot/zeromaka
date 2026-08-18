"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { levelFor } from "@/lib/data";
import {
  LayoutDashboard, Wallet, ArrowLeftRight, FileText, ClipboardList, Landmark,
  Users, BarChart3, Trophy, Medal, Flame, HandCoins,
  Receipt, PiggyBank, RefreshCw, GitCompareArrows, TrendingUp, Paperclip, ShieldCheck, Wrench, FileSpreadsheet, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu, X, Tags, Layers,
  type LucideIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import { ROUTES } from "@/lib/routes";

// Tipado explicitamente: sem isto, juntar SECTIONS com ADMIN_SECTION (que não
// tem badges) faz o TypeScript inferir um tipo sem `badge` e perder o campo.
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  { title: "Finanças", items: [
    { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/contas", label: "Contas", icon: Wallet },
    { href: "/app/transacoes", label: "Transações", icon: ArrowLeftRight },
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
    { href: "/app/patrimonio", label: "Ativos e centros", icon: Wrench }
  ]},
  { title: "Operações", items: [
    { href: "/app/requisicoes", label: "Requisições", icon: ClipboardList, badge: "req" },
    { href: "/app/capital", label: "Capital dos sócios", icon: Landmark },
    { href: "/app/emprestimos", label: "Empréstimos e adiantamentos", icon: HandCoins },
    { href: "/app/contactos", label: "Contactos", icon: Users }
  ]},
  { title: "Análise", items: [
    { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
    { href: "/app/conquistas", label: "Conquistas", icon: Trophy },
    { href: "/app/ranking", label: "Ranking", icon: Medal }
  ]}
];

// Secção separada porque só aparece a quem é owner/admin DESTA organização.
// A página revalida a permissão por si (e o servidor também, em cada RPC) —
// esconder aqui é só para não mostrar um caminho sem saída a quem não pode.
const ADMIN_SECTION: NavSection = { title: "Administração", items: [
  { href: "/app/administracao", label: "Empresas e equipa", icon: ShieldCheck }
]};

// Navegação reduzida para os 9 papéis de âmbito estreito — mostra só as
// páginas que a pessoa realmente consegue ver, para não a mandar para telas
// em branco por falta de permissão (o RLS bloqueia os dados; isto é só para
// não mostrar o caminho). Espelha a matriz de role_resource_permissions no
// servidor — se aquela mudar, isto tem de mudar também. Ausência de entrada
// (ex.: 'convidado_temp') significa sem nenhuma secção própria, só os itens
// fixos no fundo (Categorias, Empresa, Perfil).
const NARROW_ROLE_SECTIONS: Partial<Record<string, NavSection[]>> = {
  requisitante: [{ title: "Requisições", items: [
    { href: "/app/requisicoes", label: "Requisições", icon: ClipboardList },
  ]}],
  aprovador: [{ title: "Requisições", items: [
    { href: "/app/requisicoes", label: "Requisições", icon: ClipboardList, badge: "req" },
  ]}],
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
    { href: "/app/transacoes", label: "Transações", icon: ArrowLeftRight },
  ]}],
  contabilista: [{ title: "Finanças", items: [
    { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/transacoes", label: "Transações", icon: ArrowLeftRight },
    { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  ]}],
  auditor: [{ title: "Auditoria", items: [
    { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  ]}],
};

const COLLAPSED_KEY = "zeromaka_sidebar_collapsed";
const CLOSED_SECTIONS_KEY = "zeromaka_sidebar_closed_sections";

export default function Sidebar() {
  const path = usePathname();
  const { profile, obligations, requisitions, logout, orgId, organizations, switchOrganization } = useStore();
  const currentOrg = organizations.find(o => o.id === orgId);
  // A secção de administração só aparece a quem é owner/admin desta
  // organização. Não é a proteção real — essa está na página e em cada RPC do
  // servidor; aqui é só para não mostrar um caminho sem saída.
  const isAdmin = currentOrg?.role === "owner" || currentOrg?.role === "admin";
  // Papéis de âmbito estreito usam uma navegação própria, bem mais curta —
  // ver NARROW_ROLE_SECTIONS. Os 5 papéis "clássicos" (owner/admin/finance/
  // viewer/member) continuam a ver a navegação completa, como sempre viram.
  const narrowSections = currentOrg?.role ? NARROW_ROLE_SECTIONS[currentOrg.role] : undefined;
  // "Painel de grupo" só faz sentido a quem tem mais do que uma empresa E vê
  // a navegação completa — não faz sentido oferecê-lo a um papel de âmbito
  // estreito, que já não vê dados financeiros de UMA empresa, quanto mais
  // comparar várias.
  const baseSections = narrowSections ?? (organizations.length > 1
    ? SECTIONS.map(sec => sec.title === "Análise"
        ? { ...sec, items: [{ href: "/app/grupo", label: "Painel de grupo", icon: Layers }, ...sec.items] }
        : sec)
    : SECTIONS);
  const visibleSections = isAdmin ? [...baseSections, ADMIN_SECTION] : baseSections;
  const [switching, setSwitching] = useState(false);
  const lv = levelFor(profile.xp);
  const isOverdue = (s: string) => s === "overdue" || s === "partial_overdue";
  const overdue = obligations.filter((o) => o.direction === "receivable" && isOverdue(o.financialStatus)).length;
  const payableOverdue = obligations.filter((o) => o.direction === "payable" && isOverdue(o.financialStatus)).length;
  const pendingReq = requisitions.filter((r) => r.status === "pendente").length;
  const initials = profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const badgeVal = (k?: string) => k === "overdue" ? overdue : k === "payable" ? payableOverdue : k === "req" ? pendingReq : 0;

  // Barra encolhida (só ícones) e secções fechadas — ambas persistidas.
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  // Menu em drawer no telemóvel — a barra lateral fica escondida por defeito (hidden md:flex),
  // por isso no ecrã pequeno é preciso um botão a abrir/fechar como overlay.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
      const raw = localStorage.getItem(CLOSED_SECTIONS_KEY);
      if (raw) setClosed(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { setMobileOpen(false); }, [path]);

  const toggleCollapsed = () => {
    const v = !collapsed;
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };
  const toggleSection = (title: string) => {
    const v = closed.includes(title) ? closed.filter(t => t !== title) : [...closed, title];
    setClosed(v);
    try { localStorage.setItem(CLOSED_SECTIONS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  };

  const navLink = (href: string, label: string, Icon: typeof Wallet, bv: number, active: boolean) => (
    <Link key={href} href={href} title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200
        ${collapsed ? "justify-center px-0" : ""}
        ${active ? "bg-maka-500/15 text-maka-400 font-semibold" : "text-ink-300 hover:bg-ink-900 hover:text-ink-100 hover:translate-x-0.5"}`}>
      {/* marcador do item ativo */}
      {active && !collapsed && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-maka-500" />}
      <Icon size={17} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {bv > 0 && (
        <span className={`rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5
          ${collapsed ? "absolute top-0.5 right-1 px-1 py-0" : ""}`}>{bv}</span>
      )}
    </Link>
  );

  return (
    <>
      {/* Botão para abrir o menu no telemóvel — a barra lateral fica fora do ecrã por defeito */}
      <button onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="md:hidden fixed top-3 left-3 z-40 flex items-center justify-center h-10 w-10 rounded-lg bg-ink-950 border border-ink-800 text-ink-200 shadow-lg">
        <Menu size={19} />
      </button>

      {/* Fundo escurecido atrás do menu, só visível no telemóvel quando aberto */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
      )}

      <aside className={`flex shrink-0 flex-col border-r border-ink-800 bg-ink-950 p-4 fixed md:sticky inset-y-0 left-0 top-0 h-screen overflow-y-auto z-50
        transition-transform md:transition-[width] duration-300 ease-out w-64
        ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        ${collapsed ? "md:w-[76px]" : "md:w-64"}`}>
      <div className={`flex items-center gap-2 pb-4 ${collapsed ? "md:justify-center md:px-0" : "px-2"}`}>
        <div className="h-9 w-9 rounded-lg bg-maka-500 flex items-center justify-center font-display text-onbrand text-lg shrink-0 transition-transform duration-200 hover:scale-105">Z</div>
        <div className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
          <div className="font-display text-lg leading-none tracking-tight">ZERO<span className="text-maka-500">MAKA</span></div>
          <div className="text-[10px] text-ink-500 tracking-widest uppercase truncate">Sem maka, só lucro</div>
        </div>
        <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu"
          className="md:hidden ml-auto flex items-center justify-center h-8 w-8 rounded-lg text-ink-400 hover:bg-ink-900 hover:text-ink-100">
          <X size={17} />
        </button>
      </div>

      {/* Encolher / expandir a barra para dar espaço ao conteúdo */}
      <button onClick={toggleCollapsed}
        title={collapsed ? "Expandir menu" : "Encolher menu"}
        aria-label={collapsed ? "Expandir menu" : "Encolher menu"}
        className={`hidden md:flex items-center gap-2 rounded-lg border border-ink-800 text-ink-400 hover:text-ink-100 hover:bg-ink-900
          transition-colors py-1.5 mb-3 ${collapsed ? "justify-center px-0" : "px-3"}`}>
        {collapsed ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /><span className="text-[11px] font-medium">Encolher</span></>}
      </button>

      {!collapsed && (
        <div className="card p-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-maka-500/15 border border-maka-500/40 flex items-center justify-center text-maka-400 font-bold text-sm shrink-0">{initials}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{profile.name}</div>
              <div className="text-[11px] text-ink-400">Nível {lv.level} · {lv.name}</div>
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full bg-maka-500 transition-all duration-500" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-400">
            <span>{profile.xp.toLocaleString("pt-AO")} XP</span>
            <span className="flex items-center gap-1 text-maka-400"><Flame size={12} /> {profile.streak} dias</span>
          </div>
        </div>
      )}

      {/* Só aparece a quem pertence a mais do que uma organização — evita que
          movimentos lançados numa organização "desapareçam" por terem ido
          parar a outra sem o utilizador reparar. */}
      {organizations.length > 1 && (
        <div className={`mb-3 ${collapsed ? "px-0" : ""}`}>
          {!collapsed && <div className="px-1 mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-600">Organização</div>}
          <select
            aria-label="Organização ativa"
            title={collapsed ? (currentOrg?.name || "Organização") : undefined}
            className="input text-xs py-1.5"
            value={orgId || ""}
            disabled={switching}
            onChange={async (e) => {
              const next = e.target.value;
              if (!next || next === orgId) return;
              setSwitching(true);
              await switchOrganization(next);
              setSwitching(false);
            }}>
            {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      <nav className="flex-1 space-y-3">
        {visibleSections.map((sec) => {
          const isClosed = closed.includes(sec.title);
          return (
            <div key={sec.title}>
              {!collapsed && (
                <button onClick={() => toggleSection(sec.title)}
                  aria-expanded={!isClosed}
                  className="w-full flex items-center justify-between px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-600 hover:text-ink-400 transition-colors">
                  <span>{sec.title}</span>
                  <ChevronDown size={13} className={`transition-transform duration-300 ${isClosed ? "-rotate-90" : ""}`} />
                </button>
              )}
              {/* grid-rows truque: anima a altura sem saber o valor exato */}
              <div className={`grid transition-all duration-300 ease-out ${(isClosed && !collapsed) ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
                <div className="overflow-hidden">
                  <div className="space-y-0.5">
                    {sec.items.map(({ href, label, icon: Icon, badge }) =>
                      navLink(href, label, Icon, badgeVal(badge), path === href))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-4 pt-3 border-t border-ink-800 space-y-0.5">
        {navLink("/app/categorias", "Categorias", Tags, 0, path === "/app/categorias")}
      </div>
      <div className="mt-2 pt-2 border-t border-ink-800">
        <AccountMenu name={profile.name} email={profile.email} initials={initials} collapsed={collapsed} onLogout={logout} />
      </div>
      </aside>
    </>
  );
}
