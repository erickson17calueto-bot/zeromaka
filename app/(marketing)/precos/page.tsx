import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { PLANOS, COMPARACAO, LANCAMENTO_GRATUITO } from "@/lib/pricing";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Preços",
  description:
    "O ZeroMaka está gratuito durante o lançamento. Veja o que cada plano inclui e escolha o que serve à sua empresa.",
  alternates: { canonical: "/precos" },
};

function Marca({ valor }: { valor: string | boolean }) {
  if (valor === true) return <><Check size={16} className="mx-auto text-maka-500" aria-hidden="true" /><span className="sr-only">Incluído</span></>;
  if (valor === false) return <><Minus size={16} className="mx-auto text-ink-600" aria-hidden="true" /><span className="sr-only">Não incluído</span></>;
  return <span className="text-[13px] text-ink-300">{valor}</span>;
}

export default function PrecosPage() {
  return (
    <>
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18 text-center">
          {LANCAMENTO_GRATUITO && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-maka-500/40 bg-maka-500/10 px-3 py-1 text-[12px] font-semibold text-maka-300">
              <Sparkles size={13} aria-hidden="true" /> Gratuito durante o lançamento
            </p>
          )}
          <h1 className="mt-5 font-display text-3xl sm:text-4xl tracking-tight">Preços simples e sem surpresas</h1>
          <p className="mt-4 text-ink-300 max-w-2xl mx-auto leading-relaxed">
            {LANCAMENTO_GRATUITO ? (
              <>
                Neste momento o ZeroMaka é <strong className="text-ink-100">totalmente gratuito</strong>, com todas as
                funcionalidades disponíveis. Estamos em lançamento e ainda não cobramos nada. Quando os preços
                forem definidos, avisamos com antecedência — e ninguém é cobrado sem concordar primeiro.
              </>
            ) : (
              <>Escolha o plano que serve à dimensão da sua empresa.</>
            )}
          </p>
        </div>
      </section>

      {/* Planos */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <ul className="grid gap-4 lg:grid-cols-3 items-start">
            {PLANOS.map((p) => (
              <li key={p.id}
                className={`card p-6 relative ${p.destaque ? "border-maka-500/50 ring-1 ring-maka-500/20" : ""}`}>
                {p.destaque && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-maka-500 px-2.5 py-0.5 text-[11px] font-bold text-onbrand">
                    Mais popular
                  </span>
                )}

                <h2 className="font-display text-xl tracking-tight">{p.nome}</h2>
                <p className="mt-1 text-[13px] text-maka-400 font-medium">{p.publico}</p>
                <p className="mt-3 text-sm text-ink-400 leading-relaxed min-h-[2.5rem]">{p.descricao}</p>

                <div className="mt-5 pb-5 border-b border-ink-800">
                  {LANCAMENTO_GRATUITO || p.preco === null ? (
                    <>
                      <p className="font-display text-2xl tracking-tight text-maka-400">Gratuito</p>
                      <p className="mt-1 text-[12px] text-ink-500">
                        {LANCAMENTO_GRATUITO ? "Durante o lançamento" : "Preço a anunciar"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-2xl tracking-tight">
                        Kz {p.preco.toLocaleString("pt-AO")}
                        <span className="text-sm font-body font-normal text-ink-400"> /mês</span>
                      </p>
                      <p className="mt-1 text-[12px] text-ink-500">Por empresa, sem fidelização</p>
                    </>
                  )}
                </div>

                <ul className="mt-5 space-y-2.5">
                  {p.inclui.map((i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-ink-300">
                      <Check size={15} className="mt-0.5 shrink-0 text-maka-500" aria-hidden="true" /> {i}
                    </li>
                  ))}
                </ul>

                <Link
                  href={p.cta === "Falar connosco" ? "/contacto" : ROUTES.criarConta}
                  className={`${p.destaque ? "btn-primary" : "btn-ghost"} w-full justify-center mt-6`}>
                  {p.cta} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comparação */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">Comparar planos</h2>
          <p className="mt-3 text-ink-400">Todos os planos estão gratuitos durante o lançamento.</p>

          {/* A tabela rola dentro do próprio contentor para a página não rolar na horizontal */}
          <div className="mt-8 overflow-x-auto rounded-xl border border-ink-800">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Comparação de funcionalidades entre os planos Solo, Equipa e Contabilista</caption>
              <thead>
                <tr className="bg-ink-900">
                  <th scope="col" className="text-left font-semibold px-4 py-3">Recurso</th>
                  <th scope="col" className="font-semibold px-4 py-3 w-32">Solo</th>
                  <th scope="col" className="font-semibold px-4 py-3 w-32 text-maka-400">Equipa</th>
                  <th scope="col" className="font-semibold px-4 py-3 w-32">Contabilista</th>
                </tr>
              </thead>
              <tbody>
                {COMPARACAO.map((linha, i) => (
                  <tr key={linha.recurso} className={i % 2 ? "bg-ink-900/40" : ""}>
                    <th scope="row" className="text-left font-normal text-ink-300 px-4 py-3">{linha.recurso}</th>
                    <td className="px-4 py-3 text-center"><Marca valor={linha.solo} /></td>
                    <td className="px-4 py-3 text-center"><Marca valor={linha.equipa} /></td>
                    <td className="px-4 py-3 text-center"><Marca valor={linha.contabilista} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Perguntas sobre preços */}
      <section>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">Perguntas sobre preços</h2>
          <dl className="mt-8 space-y-6">
            <div>
              <dt className="font-semibold">É mesmo gratuito?</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                Sim. Neste momento não cobramos nada e todas as funcionalidades estão disponíveis.
                Não pedimos cartão de crédito para criar conta.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">O que acontece quando começarem a cobrar?</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                Avisamos com antecedência por e-mail. Nenhuma conta passa a ser cobrada automaticamente —
                terá de escolher um plano de forma explícita.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Posso exportar os meus dados se sair?</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                Sim. Os relatórios e o histórico de transações exportam para PDF e Excel a qualquer momento.
                Os dados são seus.
              </dd>
            </div>
          </dl>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={ROUTES.criarConta} className="btn-primary">
              Criar conta gratuita <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link href="/contacto" className="btn-ghost">Tenho outra pergunta</Link>
          </div>
        </div>
      </section>
    </>
  );
}
