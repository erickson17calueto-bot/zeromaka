import Link from "next/link";
import { MapPin } from "lucide-react";
import { ROUTES } from "@/lib/routes";

const COLUMNS = [
  {
    title: "Produto",
    links: [
      { href: "/funcionalidades", label: "Funcionalidades" },
      { href: "/precos", label: "Preços" },
      { href: "/seguranca", label: "Segurança" },
      { href: "/#como-funciona", label: "Como funciona" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { href: "/sobre", label: "Sobre" },
      { href: "/contacto", label: "Contacto" },
      { href: "/ajuda", label: "Ajuda e FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/termos", label: "Termos de utilização" },
      { href: "/privacidade", label: "Política de privacidade" },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5 w-fit">
              <span className="h-8 w-8 rounded-lg bg-maka-500 flex items-center justify-center font-display text-onbrand">Z</span>
              <span className="font-display text-lg tracking-tight">Zero<span className="text-maka-500">Maka</span></span>
            </Link>
            <p className="mt-3 text-sm text-ink-400 max-w-xs leading-relaxed">
              Gestão financeira para pequenas e médias empresas em Angola. Em Kwanzas, com os impostos certos.
            </p>
            <p className="mt-4 flex items-center gap-1.5 text-[13px] text-ink-500">
              <MapPin size={13} aria-hidden="true" /> Luanda, Angola
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{col.title}</h2>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink-300 hover:text-maka-400 transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-ink-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-[13px] text-ink-500">© {new Date().getFullYear()} ZeroMaka. Todos os direitos reservados.</p>
          <div className="flex items-center gap-2">
            <Link href={ROUTES.entrar} className="text-sm text-ink-300 hover:text-maka-400 transition-colors px-3 py-2">Entrar</Link>
            <Link href={ROUTES.criarConta} className="btn-primary">Criar conta</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
