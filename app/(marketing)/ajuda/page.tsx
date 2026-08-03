import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Ajuda e perguntas frequentes",
  description:
    "Respostas às perguntas mais comuns sobre o ZeroMaka: faturação, exportação de dados, colaboradores, telemóvel, Reservas e Disponível de verdade.",
  alternates: { canonical: "/ajuda" },
};

const FAQ = [
  {
    p: "O ZeroMaka substitui um contabilista?",
    r: "Não, e não é essa a intenção. O ZeroMaka organiza o dia a dia financeiro da empresa para que consiga decidir com informação. O trabalho técnico de contabilidade, o cumprimento fiscal e as demonstrações certificadas continuam a ser do seu contabilista — a diferença é que passa a entregar-lhe tudo organizado.",
  },
  {
    p: "O ZeroMaka emite faturas fiscais certificadas?",
    r: "Não. O ZeroMaka regista as suas faturas e acompanha o que está por receber e por pagar, mas não é um programa de faturação certificado pela AGT. Se precisa de emitir faturas fiscais, continue a usar o software certificado que já tem e registe aqui os documentos.",
  },
  {
    p: "Posso exportar os meus relatórios?",
    r: "Sim. Resultado, fluxo de caixa, ativo e passivo, apuramento de impostos e histórico de transações exportam para PDF e Excel, com filtros por período.",
  },
  {
    p: "Posso adicionar colaboradores?",
    r: "Sim. Pode convidar membros para a organização e atribuir a cada um um papel: proprietário, administrador, financeiro ou observador. Um observador consulta mas não altera, e só proprietários e administradores gerem membros.",
  },
  {
    p: "Funciona no telemóvel?",
    r: "Sim. O ZeroMaka funciona no browser do telemóvel, com a navegação adaptada ao ecrã pequeno. Não é preciso instalar nada.",
  },
  {
    p: "Posso cancelar quando quiser?",
    r: "Sim. Neste momento o serviço é gratuito, por isso não há nada a cancelar. Quando existirem planos pagos, não haverá fidelização e poderá sair a qualquer momento, exportando os seus dados antes.",
  },
  {
    p: "Posso levar os meus dados comigo?",
    r: "Sim. Os dados são seus. Pode exportar relatórios e o histórico completo de transações em PDF e Excel a qualquer momento.",
  },
  {
    p: "Como é que os meus dados são protegidos?",
    r: "Cada registo pertence a uma organização e a própria base de dados impede o acesso a quem não é membro dela. A sessão é validada no servidor a cada pedido e as palavras-passe nunca são guardadas em texto simples. A página de Segurança explica o que está implementado — e também o que ainda não está.",
  },
  {
    p: "O que é o Disponível de verdade?",
    r: "É quanto pode realmente gastar hoje. Parte do saldo em contas e caixa e desconta as reservas ativas, os compromissos já assumidos com fornecedores e a reserva mínima de caixa que definir. É quase sempre bastante menos do que o saldo do banco — e é esse o ponto.",
  },
  {
    p: "O que são as Reservas?",
    r: "São uma forma de separar dinheiro que já tem dono sem o mover da conta. O IVA a entregar ao Estado, os salários do mês ou uma poupança para um investimento. O saldo bancário não muda, mas esse valor deixa de aparecer como disponível para gastar.",
  },
  {
    p: "Já tenho anos de histórico em Excel. Perco tudo?",
    r: "Não. O ZeroMaka importa ficheiros Excel, CSV e PDF. Antes de lançar qualquer coisa mostra-lhe as linhas lidas para rever, assinalando possíveis duplicados e linhas com problemas, para confirmar antes de gravar.",
  },
  {
    p: "Que moeda e que regimes fiscais suporta?",
    r: "Kwanzas (AOA). Suporta os três regimes: Geral com IVA a 14%, Simplificado a 7% e o regime de Exclusão com Imposto de Selo a 1%. O imposto é calculado apenas sobre vendas e separado do lucro.",
  },
];

export default function AjudaPage() {
  return (
    <>
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight">Ajuda e perguntas frequentes</h1>
          <p className="mt-4 text-ink-300 leading-relaxed">
            As perguntas que nos fazem com mais frequência. Se a sua não estiver aqui,{" "}
            <Link href="/contacto" className="text-maka-400 hover:underline">escreva-nos</Link>.
          </p>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <dl className="space-y-8">
            {FAQ.map(({ p, r }) => (
              <div key={p}>
                <dt className="font-semibold text-[16px] leading-snug">{p}</dt>
                <dd className="mt-2 text-sm text-ink-400 leading-relaxed">{r}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 text-center">
          <h2 className="font-display text-2xl tracking-tight">Ainda com dúvidas?</h2>
          <p className="mt-3 text-ink-400">A forma mais rápida de perceber é experimentar.</p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Link href={ROUTES.criarConta} className="btn-primary">
              Criar conta gratuita <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link href="/contacto" className="btn-ghost">Falar connosco</Link>
          </div>
        </div>
      </section>
    </>
  );
}
