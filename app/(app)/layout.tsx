"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { useStore } from "@/lib/store";
import { LayoutDashboard, Wallet, ArrowLeftRight, FileText, Trophy, FileSpreadsheet } from "lucide-react";

const MOBILE_NAV = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/transacoes", label: "Fluxo", icon: ArrowLeftRight },
  { href: "/faturas", label: "Faturas", icon: FileText },
  { href: "/conquistas", label: "XP", icon: Trophy },
  { href: "/importacoes", label: "Importar", icon: FileSpreadsheet }
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, authed, orgId, toasts } = useStore();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!authed) { router.replace("/login"); return; }
    if (!orgId) router.replace("/onboarding");
  }, [ready, authed, orgId, router]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-ink-500">A carregar…</div>;
  if (!authed || !orgId) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-ink-800 bg-ink-950/95 backdrop-blur flex">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${path === href ? "text-maka-400" : "text-ink-400"}`}>
            <Icon size={19} /> {label}
          </Link>
        ))}
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
