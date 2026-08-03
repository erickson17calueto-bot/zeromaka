import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Ecrãs de autenticação nunca devem aparecer em resultados de pesquisa.
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Painel de marca — escondido no telemóvel para dar o ecrã todo ao formulário */}
      <aside className="hidden lg:flex flex-col justify-between bg-maka-600 p-10 text-onbrand">
        <Link href="/" className="inline-flex items-center gap-2.5 w-fit group">
          <span className="h-9 w-9 rounded-lg bg-onbrand/15 flex items-center justify-center font-display text-lg">Z</span>
          <span className="font-display text-xl tracking-tight">
            Zero<span className="text-onbrand/70">Maka</span>
          </span>
        </Link>

        <div>
          <h2 className="font-display text-3xl leading-tight">Gestão financeira<br />sem maka.</h2>
          <p className="mt-4 max-w-xs text-onbrand/80 text-sm leading-relaxed">
            Contas, faturas e caixa do teu negócio — tudo em Kwanzas, feito para a realidade angolana.
          </p>
        </div>

        <p className="flex items-center gap-1.5 text-[12px] text-onbrand/60 font-medium">
          <MapPin size={13} aria-hidden="true" /> Luanda, Angola
        </p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/"
            className="lg:hidden inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-maka-400 transition-colors mb-8">
            <ArrowLeft size={15} aria-hidden="true" /> Voltar ao site
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
