"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { levelFor } from "@/lib/data";
import {
  LayoutDashboard, Wallet, ArrowLeftRight, FileText, ClipboardList, Landmark,
  Users, BarChart3, Trophy, Medal, Building2, UserCircle, LogOut, Flame, HandCoins, Receipt, PiggyBank
} from "lucide-react";

const SECTIONS = [
  { title: "Finanças", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/contas", label: "Contas", icon: Wallet },
    { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
    { href: "/faturas", label: "A receber", icon: FileText, badge: "overdue" },
    { href: "/cobrancas", label: "Cobranças", icon: HandCoins, badge: "overdue" },
    { href: "/contas-a-pagar", label: "A pagar", icon: Receipt, badge: "payable" },
    { href: "/reservas", label: "Reservas", icon: PiggyBank }
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

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-950 p-4 sticky top-0 h-screen overflow-y-auto">
      <div className="flex items-center gap-2 px-2 pb-4">
        <div className="h-9 w-9 rounded-lg bg-maka-500 flex items-center justify-center font-display text-ink-950 text-lg">Z</div>
        <div>
          <div className="font-display text-lg leading-none tracking-tight">ZERO<span className="text-maka-500">MAKA</span></div>
          <div className="text-[10px] text-ink-500 tracking-widest uppercase">Sem maka, só lucro</div>
        </div>
      </div>

      <div className="card p-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-maka-500/15 border border-maka-500/40 flex items-center justify-center text-maka-400 font-bold text-sm">{initials}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{profile.name}</div>
            <div className="text-[11px] text-ink-400">Nível {lv.level} · {lv.name}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-ink-800 overflow-hidden">
          <div className="h-full bg-maka-500 transition-all" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-400">
          <span>{profile.xp.toLocaleString("pt-AO")} XP</span>
          <span className="flex items-center gap-1 text-maka-400"><Flame size={12} /> {profile.streak} dias</span>
        </div>
      </div>

      <nav className="flex-1 space-y-4">
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-600">{sec.title}</div>
            <div className="space-y-0.5">
              {sec.items.map(({ href, label, icon: Icon, badge }) => {
                const active = path === href;
                const bv = badgeVal(badge);
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-maka-500/15 text-maka-400 font-semibold" : "text-ink-300 hover:bg-ink-900 hover:text-white"}`}>
                    <Icon size={17} />
                    <span className="flex-1">{label}</span>
                    {bv > 0 && <span className="rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5">{bv}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 pt-3 border-t border-ink-800 space-y-0.5">
        <Link href="/empresa" className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${path === "/empresa" ? "bg-maka-500/15 text-maka-400 font-semibold" : "text-ink-300 hover:bg-ink-900 hover:text-white"}`}>
          <Building2 size={17} /> Empresa
        </Link>
        <Link href="/perfil" className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${path === "/perfil" ? "bg-maka-500/15 text-maka-400 font-semibold" : "text-ink-300 hover:bg-ink-900 hover:text-white"}`}>
          <UserCircle size={17} /> Meu perfil
        </Link>
        <button onClick={async () => { await logout(); router.push("/login"); router.refresh(); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-400 hover:bg-ink-900 hover:text-white transition-colors">
          <LogOut size={17} /> Sair
        </button>
      </div>
    </aside>
  );
}
