"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserCircle, LogOut, ChevronsUpDown } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { ROUTES } from "@/lib/routes";

/** Avatar + nome no rodapé da sidebar; ao clicar abre um popover com Perfil, Tema e Terminar sessão. */
export default function AccountMenu({
  name, email, initials, collapsed, onLogout,
}: { name: string; email?: string; initials: string; collapsed: boolean; onLogout: () => Promise<void> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const sair = async () => {
    setOpen(false);
    await onLogout();
    router.push(ROUTES.entrar);
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className={`absolute bottom-full mb-2 ${collapsed ? "left-0" : "left-0 right-0"} min-w-[228px] rounded-xl border border-ink-800 bg-ink-900 shadow-xl p-1.5 z-50`}>
          <div className="px-2.5 py-2 mb-1 border-b border-ink-800">
            <div className="text-sm font-semibold truncate">{name}</div>
            {email && <div className="text-[11px] text-ink-500 truncate">{email}</div>}
          </div>

          <Link href="/app/perfil" role="menuitem" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-100 transition-colors">
            <UserCircle size={16} /> Meu perfil
          </Link>

          <div className="px-2.5 pt-2 pb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-600 mb-1.5">Tema</div>
            <ThemeToggle />
          </div>

          <div className="mt-1 pt-1 border-t border-ink-800">
            <button onClick={sair} role="menuitem"
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut size={16} /> Terminar sessão
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        title={collapsed ? name : undefined}
        className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-ink-900 transition-colors ${collapsed ? "justify-center px-0" : ""}`}>
        <div className="h-8 w-8 rounded-full bg-maka-500/15 border border-maka-500/40 flex items-center justify-center text-maka-400 font-bold text-xs shrink-0">{initials}</div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate leading-tight">{name}</div>
              {email && <div className="text-[11px] text-ink-500 truncate leading-tight">{email}</div>}
            </div>
            <ChevronsUpDown size={14} className="text-ink-600 shrink-0" />
          </>
        )}
      </button>
    </div>
  );
}
