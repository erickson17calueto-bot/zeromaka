"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { ROUTES } from "@/lib/routes";

const NAV = [
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/precos", label: "Preços" },
  { href: "/seguranca", label: "Segurança" },
  { href: "/sobre", label: "Sobre" },
  { href: "/ajuda", label: "Ajuda" },
];

export default function MarketingHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha o menu ao mudar de página, senão fica aberto por cima do conteúdo novo.
  useEffect(() => { setOpen(false); }, [path]);

  return (
    // Cabeçalho flutuante: destaca-se do conteúdo sem o cortar com uma linha
    // a toda a largura, e deixa o brilho do hero passar por baixo.
    <header className="sticky top-0 z-40 px-3 sm:px-4 pt-3">
      <div className="mx-auto max-w-6xl rounded-2xl border border-ink-800 bg-ink-950/80 backdrop-blur-md shadow-lg px-4 sm:px-5">
        <div className="flex h-14 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="ZeroMaka — início">
            <span className="h-8 w-8 rounded-lg bg-maka-500 flex items-center justify-center font-display text-onbrand">Z</span>
            <span className="font-display text-lg tracking-tight">
              Zero<span className="text-maka-500">Maka</span>
            </span>
          </Link>

          <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label }) => {
              const active = path === href;
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "text-maka-400" : "text-ink-300 hover:text-ink-100 hover:bg-ink-900"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            <Link href={ROUTES.entrar} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-300 hover:text-ink-100 transition-colors">
              Entrar
            </Link>
            <Link href={ROUTES.criarConta} className="btn-primary">Começar gratuitamente</Link>
          </div>

          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="menu-mobile"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg border border-ink-800 text-ink-200">
            {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="menu-mobile" className="md:hidden mx-auto max-w-6xl mt-2 rounded-2xl border border-ink-800 bg-ink-950/95 backdrop-blur-md shadow-lg">
          <nav aria-label="Navegação principal" className="px-3 py-3 space-y-1">
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                  path === href ? "bg-maka-500/15 text-maka-400" : "text-ink-300 hover:bg-ink-900"}`}>
                {label}
              </Link>
            ))}
            <div className="pt-3 mt-2 border-t border-ink-800 space-y-2">
              <Link href={ROUTES.entrar} className="btn-ghost w-full justify-center">Entrar</Link>
              <Link href={ROUTES.criarConta} className="btn-primary w-full justify-center">Começar gratuitamente</Link>
              <div className="pt-1"><ThemeToggle /></div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
