import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight, Check, Database, FileDown, KeyRound, Lock, ScrollText, Users } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Segurança",
  description:
    "Como o ZeroMaka protege os dados financeiros da sua empresa: isolamento por organização, papéis e permissões, histórico de alterações e autenticação validada no servidor.",
  alternates: { canonical: "/seguranca" },
};

const MEDIDAS = [
  {
    icon: Database,
    titulo: "Isolamento por empresa",
    texto:
      "Cada registo financeiro pertence a uma organização. A própria base de dados recusa devolver linhas de uma empresa a quem não é membro dela — não é uma verificação feita apenas no ecrã, é uma regra aplicada abaixo da aplicação.",
  },
  {
    icon: Users,
    titulo: "Papéis e permissões",
    texto:
      "Um membro pode ser proprietário, administrador, financeiro ou observador. Um observador consegue consultar mas não alterar; só proprietários e administradores gerem membros. As permissões são verificadas no servidor a cada operação.",
  },
  {
    icon: KeyRound,
    titulo: "Autenticação validada no servidor",
    texto:
      "A sessão vive em cookies que o JavaScript da página não consegue ler. Em cada pedido protegido o token é validado junto do servidor de autenticação — não confiamos apenas no que o browser diz ser.",
  },
  {
    icon: Lock,
    titulo: "Palavras-passe nunca guardadas em claro",
    texto:
      "As palavras-passe são geridas pelo serviço de autenticação e guardadas apenas como hash. Nem nós as conseguimos ver. A recuperação é feita por link temporário enviado para o seu e-mail.",
  },
  {
    icon: ScrollText,
    titulo: "Histórico de alterações",
    texto:
      "Movimentos confirmados não desaparecem em silêncio. Alterações relevantes geram um registo de auditoria com quem fez, o quê e quando.",
  },
  {
    icon: FileDown,
    titulo: "Os dados são seus",
    texto:
      "Pode exportar relatórios e histórico de transações em PDF e Excel quando quiser. Não prendemos os seus dados dentro da plataforma.",
  },
];

export default function SegurancaPage() {
  return (
    <>
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight max-w-2xl">
            São dados financeiros. Tratamos como tal.
          </h1>
          <p className="mt-4 text-ink-300 max-w-2xl leading-relaxed">
            Abaixo está exatamente o que está implementado hoje — e, no fim, o que ainda não está.
            Preferimos dizer-lhe o que falta a deixá-lo assumir o que não é verdade.
          </p>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">O que está implementado</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {MEDIDAS.map(({ icon: Icon, titulo, texto }) => (
              <li key={titulo} className="card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3 className="mt-3.5 font-semibold text-[15px]">{titulo}</h3>
                <p className="mt-2 text-[13px] text-ink-400 leading-relaxed">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Honestidade sobre o que ainda não existe — evita afirmações não comprováveis */}
      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="flex items-center gap-2 font-display text-2xl tracking-tight">
            <AlertTriangle size={20} className="text-maka-500" aria-hidden="true" /> O que ainda não afirmamos
          </h2>
          <p className="mt-4 text-sm text-ink-300 leading-relaxed">
            Muitas plataformas exibem selos que nunca auditaram. Nós preferimos ser diretos sobre o que
            ainda não temos:
          </p>
          <ul className="mt-5 space-y-3">
            {[
              "Não temos certificações de segurança externas (ISO, SOC 2 ou equivalentes).",
              "Não afirmamos ter um plano de recuperação de desastre testado e documentado.",
              "Ainda não oferecemos autenticação de dois fatores nem início de sessão empresarial (SSO).",
              "Ainda não publicámos um acordo formal de nível de serviço.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5 text-sm text-ink-400 leading-relaxed">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-600" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-ink-400 leading-relaxed">
            Se a sua empresa precisa de alguma destas garantias antes de avançar, diga-nos —
            isso ajuda-nos a decidir o que construir a seguir.
          </p>
        </div>
      </section>

      <section className="border-b border-ink-800">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-18">
          <h2 className="font-display text-2xl tracking-tight">Tratamento dos dados</h2>
          <dl className="mt-7 space-y-6">
            <div>
              <dt className="font-semibold">Que dados recolhemos</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                O necessário para o serviço funcionar: o seu nome e e-mail, os dados da empresa que
                introduz e os movimentos financeiros que regista.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Para que os usamos</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                Para lhe prestar o serviço. Não vendemos os seus dados nem os partilhamos com terceiros
                para publicidade.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Quem consegue ver</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                Apenas os membros que convidar para a sua organização, dentro do papel que lhes atribuir.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Comunicar um problema de segurança</dt>
              <dd className="mt-1.5 text-sm text-ink-400 leading-relaxed">
                Se encontrou uma vulnerabilidade, contacte-nos antes de a tornar pública. Respondemos e
                corrigimos com prioridade. <Link href="/contacto" className="text-maka-400 hover:underline">Falar connosco</Link>.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center">
          <p className="inline-flex items-center gap-1.5 text-[13px] text-ink-400">
            <Check size={14} className="text-maka-500" aria-hidden="true" /> Ligação cifrada em todo o site
          </p>
          <h2 className="mt-4 font-display text-2xl sm:text-3xl tracking-tight">Comece com a sua empresa</h2>
          <Link href={ROUTES.criarConta} className="btn-primary mt-7 text-base px-6 py-3">
            Criar conta gratuita <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
