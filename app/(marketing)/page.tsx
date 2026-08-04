import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, BadgeCheck, BarChart3, CheckCircle2, ClipboardList, CreditCard, FileSpreadsheet,
  FileText, HandCoins, Landmark, PiggyBank, Receipt, ShieldCheck, Smartphone, TrendingUp,
  Truck, UtensilsCrossed, Store, Users, Wallet, Briefcase,
} from "lucide-react";
import DashboardPreview from "@/components/marketing/DashboardPreview";
import PersonaRotator from "@/components/marketing/PersonaRotator";
import Reveal from "@/components/marketing/Reveal";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Gestão financeira sem maka",
  description:
    "Saiba quanto pode gastar antes que falte dinheiro. Controle o caixa, acompanhe quem lhe deve e prepare pagamentos — em Kwanzas, feito para empresas em Angola.",
  alternates: { canonical: "/" },
};

const PROBLEMAS = [
  "Dinheiro espalhado entre banco, caixa e folhas de Excel.",
  "Cobranças esquecidas que só aparecem quando o cliente some.",
  "Pagamentos que caem de surpresa no fim do mês.",
  "Saldo do banco confundido com dinheiro livre para gastar.",
  "Relatórios que demoram dias a fechar.",
  "Nenhuma previsão do que aí vem.",
];

const FUNCIONALIDADES = [
  { icon: BarChart3, titulo: "Dashboard", texto: "O pulso do negócio num ecrã: saldos, resultado do mês e alertas." },
  { icon: Wallet, titulo: "Receitas e despesas", texto: "Entradas e saídas com categorias, contactos e anexos." },
  { icon: FileText, titulo: "Contas a receber", texto: "Quem lhe deve, quanto e desde quando." },
  { icon: Receipt, titulo: "Contas a pagar", texto: "Compromissos com fornecedores e datas de vencimento." },
  { icon: HandCoins, titulo: "Cobranças", texto: "Acompanhamento do que está vencido e do contacto feito." },
  { icon: PiggyBank, titulo: "Reservas", texto: "Separe dinheiro comprometido sem o mover da conta." },
  { icon: TrendingUp, titulo: "Previsão de caixa", texto: "O que entra e sai nas próximas semanas." },
  { icon: ClipboardList, titulo: "Requisições", texto: "Pedidos de fundos com aprovação antes de sair dinheiro." },
  { icon: FileSpreadsheet, titulo: "Importação de ficheiros", texto: "Traga o histórico de Excel, CSV ou PDF." },
  { icon: CreditCard, titulo: "Impostos", texto: "IVA ou Imposto de Selo calculado conforme o seu regime." },
];

const PASSOS = [
  { n: 1, titulo: "Configure a empresa", texto: "Nome, NIF e regime fiscal. Leva poucos minutos." },
  { n: 2, titulo: "Registe ou importe movimentos", texto: "Comece do zero ou traga o histórico que já tem." },
  { n: 3, titulo: "Acompanhe cobranças e pagamentos", texto: "Saiba quem lhe deve e a quem tem de pagar." },
  { n: 4, titulo: "Veja quanto pode gastar", texto: "O Disponível de verdade, já sem compromissos." },
  { n: 5, titulo: "Decida com segurança", texto: "Relatórios prontos quando precisar deles." },
];

const PUBLICO = [
  { icon: Store, label: "Lojas e comércio" },
  { icon: Truck, label: "Logística e transporte" },
  { icon: UtensilsCrossed, label: "Restauração" },
  { icon: Briefcase, label: "Consultoria" },
  { icon: Users, label: "Prestadores de serviços" },
  { icon: Landmark, label: "Empresas com equipas" },
];

const CALCULO = [
  { label: "Saldo em contas e caixa", valor: "Kz 17.550.000,00", sinal: "" },
  { label: "Reservas ativas", valor: "Kz 3.200.000,00", sinal: "−" },
  { label: "Compromissos a pagar", valor: "Kz 2.360.000,00", sinal: "−" },
  { label: "Reserva mínima de caixa", valor: "Kz 500.000,00", sinal: "−" },
];

const SEGURANCA = [
  "Cada empresa vê apenas os seus dados, isolados na base de dados.",
  "Papéis e permissões: quem pode ver, quem pode lançar, quem pode aprovar.",
  "Histórico de alterações nos movimentos confirmados.",
  "Autenticação por e-mail e palavra-passe, com sessão validada no servidor.",
  "Exportação dos seus dados quando quiser.",
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative border-b border-ink-800 overflow-hidden">
        <div className="glow-hero" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-maka-500/40 bg-maka-500/10 px-3 py-1 text-[12px] font-semibold text-maka-300 rise">
              <BadgeCheck size={13} aria-hidden="true" /> Plataforma financeira para empresas em Angola
            </p>

            <h1 className="mt-6 font-display text-[2.75rem] sm:text-6xl lg:text-[4rem] leading-[0.98] tracking-tight rise">
              Gestão financeira<br /><span className="text-maka-500">sem maka.</span>
            </h1>

            <p className="mt-6 text-lg text-ink-300 leading-relaxed max-w-xl rise">
              Saiba quanto pode gastar antes que falte dinheiro. Controle o caixa, acompanhe quem lhe deve,
              prepare pagamentos e descubra quanto está realmente disponível para a sua empresa.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 rise">
              <Link href={ROUTES.criarConta} className="btn-primary text-base px-6 py-3">
                Começar gratuitamente <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="#como-funciona" className="btn-ghost text-base px-6 py-3">Ver como funciona</Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-400 rise">
              <li className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-maka-500" aria-hidden="true" /> Gratuito durante o lançamento</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-maka-500" aria-hidden="true" /> Sem cartão de crédito</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-maka-500" aria-hidden="true" /> Em Kwanzas</li>
            </ul>
          </div>

          <div className="pop">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Três factos verificáveis. Onde outros põem logótipos de clientes, nós
          ainda não temos nenhum — e inventá-los seria mentir. */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              { titulo: "Feito em Luanda", texto: "Para a realidade angolana, não traduzido de outro mercado." },
              { titulo: "Em Kwanzas", texto: "Bancos locais, carteiras móveis e os três regimes fiscais." },
              { titulo: "Gratuito no lançamento", texto: "Todas as funcionalidades, sem cartão de crédito." },
            ].map((f, i) => (
              <Reveal key={f.titulo} as="li" delay={i * 80}
                className="rounded-xl border border-ink-800 bg-gradient-to-br from-maka-500/[0.07] to-transparent p-5">
                <h2 className="font-semibold text-[15px]">{f.titulo}</h2>
                <p className="mt-1.5 text-[13px] text-ink-400 leading-relaxed">{f.texto}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Personas */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-4xl tracking-tight titulo-degrade max-w-2xl leading-tight">
              Cada pessoa da empresa vê o que lhe interessa
            </h2>
            <p className="mt-4 text-ink-400 max-w-2xl">
              O mesmo sistema, quatro perguntas diferentes. Escolha um papel para ver o que muda.
            </p>
          </Reveal>

          <Reveal delay={120} className="mt-10">
            <PersonaRotator />
          </Reveal>
        </div>
      </section>

      {/* Problemas */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight">
            Se gerir a empresa dá esta maka, não é culpa sua.
          </h2>
          <p className="mt-3 text-ink-400 max-w-2xl">
            É o que acontece quando o dinheiro está em vários sítios e nenhum deles fala com o outro.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEMAS.map((p) => (
              <li key={p} className="card p-4 text-sm text-ink-300 leading-relaxed">{p}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="border-b border-ink-800 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight">Como funciona</h2>
          <p className="mt-3 text-ink-400 max-w-2xl">Cinco passos entre criar a conta e saber quanto pode gastar.</p>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PASSOS.map(({ n, titulo, texto }) => (
              <li key={n} className="card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-maka-500 font-display text-onbrand">{n}</span>
                <h3 className="mt-3 font-semibold text-[15px]">{titulo}</h3>
                <p className="mt-1.5 text-[13px] text-ink-400 leading-relaxed">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Disponível de verdade */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-maka-400">O número que interessa</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl tracking-tight">Disponível de verdade</h2>
            <p className="mt-4 text-ink-300 leading-relaxed">
              O saldo do banco mente. Ainda não pagou os fornecedores desta semana, ainda tem dinheiro
              guardado para o IVA e ainda precisa de manter um mínimo em caixa.
            </p>
            <p className="mt-3 text-ink-300 leading-relaxed">
              O ZeroMaka desconta tudo isso e mostra o que sobra de facto para gastar hoje.
            </p>
            <Link href="/funcionalidades" className="btn-ghost mt-6">
              Ver todas as funcionalidades <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="card p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500 mb-4">Exemplo ilustrativo</p>
            <dl className="space-y-1">
              {CALCULO.map(({ label, valor, sinal }) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-2 border-b border-ink-800">
                  <dt className="text-sm text-ink-400">{label}</dt>
                  <dd className="font-medium tabular-nums whitespace-nowrap">
                    <span className="text-ink-500 mr-1">{sinal}</span>{valor}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl border border-maka-500/40 bg-maka-500/10 p-4 flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-maka-300">Disponível de verdade</span>
              <span className="font-display text-lg tracking-tight text-maka-400 tabular-nums whitespace-nowrap">Kz 11.490.000,00</span>
            </div>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight">Tudo o que precisa, num só sítio</h2>
          <p className="mt-3 text-ink-400 max-w-2xl">
            Feito para a realidade angolana: bancos locais, carteiras móveis, caixa físico e os três regimes fiscais.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONALIDADES.map(({ icon: Icon, titulo, texto }) => (
              <li key={titulo} className="card p-5">
                <Icon size={19} className="text-maka-500" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-[15px]">{titulo}</h3>
                <p className="mt-1.5 text-[13px] text-ink-400 leading-relaxed">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Público-alvo */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight">Para quem é o ZeroMaka</h2>
          <p className="mt-3 text-ink-400 max-w-2xl">
            Pequenos e médios negócios que já passaram do caderno, mas ainda não precisam de um ERP pesado.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLICO.map(({ icon: Icon, label }) => (
              <li key={label} className="card p-4 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Segurança + Relatórios */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18 grid lg:grid-cols-2 gap-10">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-tight">
              <ShieldCheck size={22} className="text-maka-500" aria-hidden="true" /> Os seus dados, isolados
            </h2>
            <ul className="mt-5 space-y-2.5">
              {SEGURANCA.map((s) => (
                <li key={s} className="flex gap-2.5 text-sm text-ink-300 leading-relaxed">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-maka-500" aria-hidden="true" /> {s}
                </li>
              ))}
            </ul>
            <Link href="/seguranca" className="btn-ghost mt-6">
              Como protegemos os dados <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-tight">
              <BarChart3 size={22} className="text-maka-500" aria-hidden="true" /> Relatórios prontos
            </h2>
            <p className="mt-4 text-sm text-ink-300 leading-relaxed">
              Demonstração de resultados, fluxo de caixa, ativo e passivo, apuramento de impostos e histórico
              de transações — com filtros por período e exportação em PDF ou Excel.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["DRE", "Fluxo de caixa", "Ativo e passivo", "Impostos", "PDF", "Excel"].map((t) => (
                <span key={t} className="rounded-lg border border-ink-700 px-2.5 py-1 text-[12px] font-medium text-ink-300">{t}</span>
              ))}
            </div>
            <p className="mt-5 rounded-lg border border-ink-800 bg-ink-900 p-3 text-[12px] text-ink-400 leading-relaxed">
              Os relatórios do ZeroMaka são de gestão interna. Não substituem demonstrações financeiras
              certificadas nem o trabalho do seu contabilista.
            </p>
          </div>
        </div>
      </section>

      {/* Convite a piloto — sem depoimentos inventados */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <div className="card p-6 sm:p-8 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-maka-400">Estamos a começar</p>
            <h2 className="mt-2 font-display text-2xl tracking-tight">Quer ser das primeiras empresas?</h2>
            <p className="mt-3 text-ink-300 leading-relaxed">
              O ZeroMaka está em fase de lançamento. Ainda não temos depoimentos para mostrar — preferimos
              não inventar. O que temos é o produto a funcionar e vontade de o afinar com quem o usa a sério.
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

      {/* CTA final */}
      <section>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight max-w-2xl mx-auto leading-tight">
            Pare de gerir a empresa olhando apenas para o saldo bancário.
          </h2>
          <p className="mt-4 text-ink-400 max-w-xl mx-auto">
            Em poucos minutos fica a saber quanto tem, quanto lhe devem e quanto pode gastar.
          </p>
          <Link href={ROUTES.criarConta} className="btn-primary mt-8 text-base px-6 py-3">
            Criar a minha conta <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
