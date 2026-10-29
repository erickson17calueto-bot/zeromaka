"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AppTopbar from "@/components/AppTopbar";
import { useStore } from "@/lib/store";
import { LayoutDashboard, ArrowLeftRight, FileText, Receipt, MoreHorizontal } from "lucide-react";
import { ROUTES } from "@/lib/routes";

const MOBILE_NAV = [
  { href: ROUTES.dashboard, label: "Início", icon: LayoutDashboard },
  { href: "/app/transacoes", label: "Movimentos", icon: ArrowLeftRight },
  { href: "/app/faturas", label: "A receber", icon: FileText },
  { href: "/app/contas-a-pagar", label: "A pagar", icon: Receipt },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, contextError, authed, orgId, toasts, logout } = useStore();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready || contextError) return;
    // O middleware já bloqueia o acesso sem sessão; isto cobre a sessão que
    // expira com a página aberta e o caso de ainda não existir organização.
    if (!authed) { router.replace(ROUTES.entrar); return; }
    if (!orgId) router.replace(ROUTES.onboarding);
  }, [ready, contextError, authed, orgId, router]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-ink-500">A carregar…</div>;
  if (contextError) return <div className="min-h-screen flex items-center justify-center p-4">
    <div className="card max-w-md p-6"><p role="alert">{contextError}</p>
      <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>Tentar novamente</button>
      <button type="button" className="btn-secondary mt-3 ml-3" onClick={async () => { await logout(); window.location.assign(ROUTES.entrar); }}>Entrar novamente</button>
    </div></div>;
  if (!authed || !orgId) return null;

  return (
    <div className="app-workspace flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1 flex flex-col">
        <AppTopbar />
        <main className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-7 md:py-7 md:pb-10">
          <div className="app-content">{children}</div>
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-ink-800 bg-ink-950/95 backdrop-blur flex">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${path === href ? "text-maka-400" : "text-ink-400"}`}>
            <Icon size={19} /> {label}
          </Link>
        ))}
        <button type="button" onClick={() => window.dispatchEvent(new Event("zeromaka:open-menu"))}
          className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] text-ink-400"
          aria-label="Abrir mais áreas">
          <MoreHorizontal size={19} /> Mais
        </button>
      </nav>

      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-xs">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg border animate-[slideIn_.2s_ease-out] ${
            t.kind === "xp" ? "bg-maka-500/15 border-maka-500/40 text-maka-300"
            : t.kind === "warn" ? "bg-red-500/15 border-red-500/40 text-red-300"
            : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
