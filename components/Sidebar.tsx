"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { levelFor } from "@/lib/data";
import {
  LayoutDashboard, Wallet, ArrowLeftRight, FileText, ClipboardList, Landmark,
  Users, BarChart3, Trophy, Medal, Building2, UserCircle, LogOut, Flame, HandCoins,
  Receipt, PiggyBank, RefreshCw, GitCompareArrows, TrendingUp, Paperclip, ShieldCheck, Wrench, FileSpreadsheet, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu, X,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const SECTIONS = [
  { title: "Finanças", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/contas", label: "Contas", icon: Wallet },
    { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
    { href: "/faturas", label: "A receber", icon: FileText, badge: "overdue" },
    { href: "/cobrancas", label: "Cobranças", icon: HandCoins, badge: "overdue" },
    { href: "/contas-a-pagar", label: "A pagar", icon: Receipt, badge: "payable" },
    { href: "/reservas", label: "Reservas", icon: PiggyBank },
    { href: "/recorrencias", label: "Recorrências", icon: RefreshCw },
    { href: "/reconciliacao", label: "Reconciliação", icon: GitCompareArrows },    { href: "/planeamento", label: "Planeamento", icon: TrendingUp },    { href: "/documentos", label: "Documentos e alertas", icon: Paperclip },    { href: "/importacoes", label: "Importar ficheiros", icon: FileSpreadsheet },    { href: "/governanca", label: "Governança", icon: ShieldCheck },    { href: "/patrimonio", label: "Ativos e centros", icon: Wrench }
  ]},
  { title: "Operações", items: [
    { href: "/requisicoes", label: "Requisições", icon: ClipboardList, badge: "req" },
    { href: "/capital", label: "Capital dos sócios", icon: Landmark },
    { href: "/contactos", label: "Contactos", icon: Users }
  ]},
  { title: "Análise", items: [
    { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
    { href: "/conquistas", label: "Conquistas", icon: Trophy },
    { href: "/ranking", label: "Ranking", icon: Medal }
  ]}
];

const COLLAPSED_KEY = "zeromaka_sidebar_collapsed";
const CLOSED_SECTIONS_KEY = "zeromaka_sidebar_closed_sections";

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { profile, obligations, requisitions, logout } = useStore();
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

      <nav className="flex-1 space-y-3">
        {SECTIONS.map((sec) => {
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
        {!collapsed && <div className="px-1 pb-2"><ThemeToggle /></div>}
        {navLink("/empresa", "Empresa", Building2, 0, path === "/empresa")}
        {navLink("/perfil", "Meu perfil", UserCircle, 0, path === "/perfil")}
        <button onClick={async () => { await logout(); router.push("/login"); router.refresh(); }}
          title={collapsed ? "Sair" : undefined}
          className={`group w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-400 hover:bg-ink-900 hover:text-ink-100 transition-colors ${collapsed ? "justify-center px-0" : ""}`}>
          <LogOut size={17} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
          {!collapsed && "Sair"}
        </button>
      </div>
      </aside>
    </>
  );
}
