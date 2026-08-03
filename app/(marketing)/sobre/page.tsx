import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, Eye, HeartHandshake, Target } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Sobre",
  description:
    "Porque existe o ZeroMaka: gestão financeira pensada para a realidade das pequenas e médias empresas angolanas.",
  alternates: { canonical: "/sobre" },
};

const PRINCIPIOS = [
  {
    icon: Eye,
    titulo: "Dizer a verdade sobre os números",
    texto:
      "Um saldo que parece maior do que é não ajuda ninguém. Preferimos mostrar o número desconfortável mas correto.",
  },
  {
    icon: Target,
    titulo: "Feito para Angola, não traduzido",
    texto:
      "Kwanzas, bancos locais, carteiras móveis, caixa físico e os três regimes fiscais. Não é um produto estrangeiro com as palavras trocadas.",
  },
  {
    icon: Compass,
    titulo: "Simples sem ser simplista",
    texto:
      "Quem gere um negócio não tem tempo para aprender contabilidade. Mas também não merece uma ferramenta que esconde o que importa.",
  },
  {
    icon: HeartHandshake,
    titulo: "Nada de promessas que não cumprimos",
    texto:
      "Não inventamos clientes, depoimentos nem certificações. O que dizemos que fazemos, fazemos mesmo.",
  },
];

export default function SobrePage() {
  return (
    <>
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight">Sobre o ZeroMaka</h1>
          <p className="mt-5 text-lg text-ink-300 leading-relaxed">
            &ldquo;Maka&rdquo; é confusão, problema, chatice. O nome é uma promessa: gerir o dinheiro
            da empresa sem maka.
          </p>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">O problema que resolvemos</h2>
          <div className="mt-5 space-y-4 text-ink-300 leading-relaxed">
            <p>
              A maioria das pequenas e médias empresas angolanas gere o dinheiro em folhas de Excel,
              cadernos e na cabeça de uma pessoa. Funciona — até deixar de funcionar.
            </p>
            <p>
              O problema raramente é falta de trabalho. É falta de visibilidade: o saldo do banco não diz
              quanto se pode gastar, ninguém sabe ao certo quem já pagou, e o dinheiro do imposto está
              misturado com o dinheiro da empresa.
            </p>
            <p>
              As alternativas costumam ser dois extremos: folhas de cálculo que ninguém consegue manter,
              ou sistemas pesados e caros, desenhados para outra realidade e noutra moeda.
            </p>
            <p className="text-ink-100 font-medium">
              O ZeroMaka existe para o meio-termo que faltava.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">Para quem é</h2>
          <p className="mt-5 text-ink-300 leading-relaxed">
            Para negócios que já passaram do caderno mas ainda não precisam de um ERP: lojas, logística,
            restauração, consultoria, prestadores de serviços e empresas com equipas que gastam dinheiro
            em nome da empresa.
          </p>
          <p className="mt-4 text-ink-400 text-sm leading-relaxed">
            O ZeroMaka é uma ferramenta de gestão, não um substituto do seu contabilista. Ajuda-o a chegar
            à reunião com ele já com tudo organizado.
          </p>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">Como pensamos</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {PRINCIPIOS.map(({ icon: Icon, titulo, texto }) => (
              <li key={titulo} className="card p-5">
                <Icon size={19} className="text-maka-500" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-[15px]">{titulo}</h3>
                <p className="mt-2 text-[13px] text-ink-400 leading-relaxed">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <div className="card p-6 sm:p-8">
            <h2 className="font-display text-xl tracking-tight">Estamos a começar</h2>
            <p className="mt-3 text-ink-300 leading-relaxed">
              O ZeroMaka está em fase de lançamento, a ser construído a partir de Luanda. Se gere um
              negócio e quer influenciar o que vem a seguir, fale connosco — nesta fase, cada conversa
              muda o produto.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={ROUTES.criarConta} className="btn-primary">
                Criar conta gratuita <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link href="/contacto" className="btn-ghost">Falar connosco</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
