import Link from "next/link";
import type { Metadata } from "next";
import { Clock, MapPin, MessageSquare, ShieldCheck } from "lucide-react";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Fale com a equipa do ZeroMaka: dúvidas sobre o produto, ajuda a começar ou participação no piloto.",
  alternates: { canonical: "/contacto" },
};

export default function ContactoPage() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
        <div className="grid lg:grid-cols-[1fr_1.3fr] gap-10 items-start">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl tracking-tight">Falar connosco</h1>
            <p className="mt-4 text-ink-300 leading-relaxed">
              Estamos em fase de lançamento e lemos todas as mensagens. Se gere um negócio em Angola,
              o que nos disser tem influência real no que construímos a seguir.
            </p>

            <ul className="mt-8 space-y-5">
              <li className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
                  <Clock size={17} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Tempo de resposta</h2>
                  <p className="mt-0.5 text-[13px] text-ink-400 leading-relaxed">
                    Normalmente respondemos em um a dois dias úteis.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
                  <MapPin size={17} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Onde estamos</h2>
                  <p className="mt-0.5 text-[13px] text-ink-400 leading-relaxed">Luanda, Angola.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
                  <ShieldCheck size={17} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Problemas de segurança</h2>
                  <p className="mt-0.5 text-[13px] text-ink-400 leading-relaxed">
                    Se encontrou uma vulnerabilidade, escolha esse assunto no formulário. Tratamos com prioridade.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
                  <MessageSquare size={17} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Dúvidas comuns</h2>
                  <p className="mt-0.5 text-[13px] text-ink-400 leading-relaxed">
                    Muitas perguntas já têm resposta na{" "}
                    <Link href="/ajuda" className="text-maka-400 hover:underline">página de ajuda</Link>.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <ContactForm />
        </div>
      </div>
    </section>
  );
}
