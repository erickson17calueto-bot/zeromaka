import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, BarChart3, ClipboardList, FileSpreadsheet, FileText, HandCoins,
  PiggyBank, Receipt, ShieldCheck, TrendingUp, Wallet,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Funcionalidades",
  description:
    "Controlo de caixa, contas a receber e a pagar, cobranças, reservas, Disponível de verdade, previsão, requisições e relatórios — o que o ZeroMaka faz pela sua empresa.",
  alternates: { canonical: "/funcionalidades" },
};

type Funcionalidade = {
  id: string;
  icon: typeof Wallet;
  titulo: string;
  problema: string;
  solucao: string;
  beneficio: string;
  exemplo: string;
};

const FUNCIONALIDADES: Funcionalidade[] = [
  {
    id: "caixa",
    icon: Wallet,
    titulo: "Controlo de caixa",
    problema: "O dinheiro está no banco, na carteira móvel e na gaveta — e nenhum saldo bate certo com o outro.",
    solucao: "Todas as contas num só sítio: bancos angolanos, Unitel Money, M-Pesa e caixa físico, com saldo consolidado.",
    beneficio: "Um número em que pode confiar, sem somar folhas de Excel ao fim do dia.",
    exemplo: "Recebe 500.000 Kz em numerário e transfere 300.000 Kz para o BAI. Os dois saldos atualizam-se e a transferência não conta como receita.",
  },
  {
    id: "receber",
    icon: FileText,
    titulo: "Contas a receber",
    problema: "Entregou o serviço, emitiu a fatura — e depois perde-se de vista quem ainda não pagou.",
    solucao: "Cada fatura de cliente com valor, vencimento e estado: em aberto, parcial, paga ou vencida.",
    beneficio: "Sabe a qualquer momento quanto lhe devem e há quanto tempo.",
    exemplo: "Três clientes com 1.250.000 Kz em aberto, dos quais 420.000 Kz já passaram do prazo.",
  },
  {
    id: "pagar",
    icon: Receipt,
    titulo: "Contas a pagar",
    problema: "Os pagamentos aparecem de surpresa e o dinheiro que parecia sobrar afinal já tinha dono.",
    solucao: "Compromissos com fornecedores registados com data de vencimento e valor.",
    beneficio: "Deixa de ser apanhado desprevenido no fim do mês.",
    exemplo: "Sabe na segunda-feira que na sexta saem 850.000 Kz para um fornecedor.",
  },
  {
    id: "cobrancas",
    icon: HandCoins,
    titulo: "Cobranças",
    problema: "Ligar ao cliente a perguntar por um pagamento sem saber o que já foi combinado antes.",
    solucao: "Lista do que está vencido, com registo dos contactos feitos e do que ficou acordado.",
    beneficio: "Cobra com contexto, sem repetir conversas nem perder o fio à meada.",
    exemplo: "Vê que já ligou duas vezes a um cliente e que ele prometeu pagar até dia 30.",
  },
  {
    id: "reservas",
    icon: PiggyBank,
    titulo: "Reservas",
    problema: "O IVA que tem de entregar ao Estado está na mesma conta que o dinheiro do dia a dia.",
    solucao: "Separa logicamente parte do saldo sem mover dinheiro nem criar lançamentos falsos.",
    beneficio: "O dinheiro comprometido deixa de parecer disponível.",
    exemplo: "Reserva 3.200.000 Kz para impostos e salários. O saldo não muda, mas o disponível sim.",
  },
  {
    id: "disponivel",
    icon: ShieldCheck,
    titulo: "Disponível de verdade",
    problema: "O saldo do banco diz 17 milhões, mas gastar 17 milhões deixaria a empresa sem conseguir pagar as contas.",
    solucao: "Ao saldo descontam-se as reservas, os compromissos a pagar e a reserva mínima de caixa.",
    beneficio: "Um número honesto sobre quanto pode mesmo gastar hoje.",
    exemplo: "17.550.000 Kz em conta passam a 11.490.000 Kz realmente disponíveis.",
  },
  {
    id: "previsao",
    icon: TrendingUp,
    titulo: "Previsão de caixa",
    problema: "Não faz ideia se daqui a três semanas terá dinheiro para a folha salarial.",
    solucao: "Projeção do que entra e sai com base nas obrigações já registadas.",
    beneficio: "Vê os apertos antes de eles acontecerem, com tempo para agir.",
    exemplo: "Percebe que na terceira semana do mês o caixa fica curto e antecipa uma cobrança.",
  },
  {
    id: "requisicoes",
    icon: ClipboardList,
    titulo: "Requisições",
    problema: "Funcionários gastam dinheiro da empresa e o comprovativo aparece — ou não — dias depois.",
    solucao: "Pedido de fundos com requisitante, responsável e aprovação antes de sair dinheiro.",
    beneficio: "Controlo à entrada, não uma auditoria à saída.",
    exemplo: "Um pedido de 150.000 Kz para combustível fica pendente até ser aprovado; ao aprovar, gera a despesa.",
  },
  {
    id: "relatorios",
    icon: BarChart3,
    titulo: "Relatórios",
    problema: "Fechar as contas do mês demora dias e envolve reconstruir tudo à mão.",
    solucao: "Resultado, fluxo de caixa, ativo e passivo e apuramento de impostos, com filtros por período.",
    beneficio: "Fecha o mês em minutos e entrega ao contabilista o que ele precisa.",
    exemplo: "Exporta o resultado do trimestre em PDF e o histórico de transações em Excel.",
  },
  {
    id: "equipas",
    icon: FileSpreadsheet,
    titulo: "Importação e equipas",
    problema: "Mudar de sistema significa perder o histórico — e dar acesso à equipa significa dar acesso a tudo.",
    solucao: "Importação de Excel, CSV e PDF com revisão antes de lançar, e papéis com permissões distintas.",
    beneficio: "Traz o passado consigo e controla quem faz o quê.",
    exemplo: "Importa um diário de caixa com centenas de linhas e revê os duplicados antes de confirmar.",
  },
];

export default function FuncionalidadesPage() {
  return (
    <>
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight max-w-2xl">
            Tudo o que o ZeroMaka faz pela sua empresa
          </h1>
          <p className="mt-4 text-ink-300 max-w-2xl leading-relaxed">
            Cada funcionalidade nasceu de um problema real de quem gere um negócio em Angola.
            Aqui está o problema, o que fazemos e o que muda no dia a dia.
          </p>

          <nav aria-label="Índice de funcionalidades" className="mt-8 flex flex-wrap gap-2">
            {FUNCIONALIDADES.map((f) => (
              <a key={f.id} href={`#${f.id}`}
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-[13px] font-medium text-ink-300 hover:border-maka-500/50 hover:text-maka-400 transition-colors">
                {f.titulo}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {FUNCIONALIDADES.map(({ id, icon: Icon, titulo, problema, solucao, beneficio, exemplo }, i) => (
          <section key={id} id={id} className={`scroll-mt-20 py-12 ${i > 0 ? "border-t border-ink-800" : ""}`}>
            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 items-start">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-maka-500/15 text-maka-400">
                  <Icon size={21} aria-hidden="true" />
                </span>
                <h2 className="mt-4 font-display text-2xl tracking-tight">{titulo}</h2>
                <p className="mt-3 text-sm text-ink-400 leading-relaxed">{problema}</p>
              </div>

              <div className="space-y-4">
                <div className="card p-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-maka-400">O que fazemos</h3>
                  <p className="mt-2 text-sm text-ink-200 leading-relaxed">{solucao}</p>
                </div>
                <div className="card p-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">O que muda para si</h3>
                  <p className="mt-2 text-sm text-ink-200 leading-relaxed">{beneficio}</p>
                </div>
                <div className="rounded-xl border border-ink-800 bg-ink-900/50 p-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Exemplo</h3>
                  <p className="mt-2 text-sm text-ink-300 leading-relaxed">{exemplo}</p>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="border-t border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center">
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight">Experimente com os seus próprios números</h2>
          <p className="mt-3 text-ink-400 max-w-xl mx-auto">
            Criar conta é gratuito e leva menos tempo do que fechar a folha de Excel de hoje.
          </p>
          <Link href={ROUTES.criarConta} className="btn-primary mt-7 text-base px-6 py-3">
            Começar gratuitamente <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
