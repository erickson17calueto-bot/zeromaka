"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  Building2, Wallet, Users, ArrowLeftRight, FileText, Check, X,
  ChevronRight, Rocket, ArrowRight, Sparkles,
} from "lucide-react";

type Step = {
  id: string;
  title: string;
  /** Porque este passo importa — linguagem simples */
  why: string;
  href: string;
  cta: string;
  icon: typeof Building2;
  done: boolean;
};

const seenKey = (orgId: string | null) => `zeromaka_welcome_${orgId || "anon"}`;
const hideKey = (orgId: string | null) => `zeromaka_steps_hidden_${orgId || "anon"}`;

/** Modal de boas-vindas (1ª entrada) + checklist "Primeiros passos" no dashboard. */
export default function GettingStarted() {
  const { company, accounts, contacts, transactions, obligations, orgId, profile } = useStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const [slide, setSlide] = useState(0);
  const [hidden, setHidden] = useState(true); // esconde até ler o localStorage (evita flash)

  const steps: Step[] = useMemo(() => [
    {
      id: "empresa", title: "Configurar a empresa", icon: Building2,
      why: "O NIF e o regime fiscal definem como o imposto é calculado nas tuas vendas. Sem isto, os relatórios saem incompletos.",
      href: "/empresa", cta: "Configurar empresa", done: !!company.nif,
    },
    {
      id: "contas", title: "Criar as contas do negócio", icon: Wallet,
      why: "Banco, carteira móvel (Multicaixa Express, Unitel Money) ou caixa físico. É onde o dinheiro entra e sai — sem contas não há saldo.",
      href: "/contas", cta: "Criar conta", done: accounts.length > 0,
    },
    {
      id: "contactos", title: "Registar contactos", icon: Users,
      why: "Clientes, fornecedores e sócios. Precisas deles para emitir faturas a receber e registar contas a pagar.",
      href: "/contactos", cta: "Adicionar contacto", done: contacts.length > 0,
    },
    {
      id: "lancamento", title: "Fazer o primeiro lançamento", icon: ArrowLeftRight,
      why: "Regista uma entrada ou saída de dinheiro. É assim que o saldo das contas se atualiza.",
      href: "/transacoes", cta: "Novo lançamento", done: transactions.length > 0,
    },
    {
      id: "fatura", title: "Emitir a primeira fatura", icon: FileText,
      why: "Vendas a crédito e compras a fornecedores. Marca como venda para o imposto ser calculado automaticamente.",
      href: "/faturas", cta: "Nova fatura", done: obligations.length > 0,
    },
  ], [company.nif, accounts.length, contacts.length, transactions.length, obligations.length]);

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  useEffect(() => {
    if (!orgId) return;
    try {
      if (!localStorage.getItem(seenKey(orgId))) setShowWelcome(true);
      setHidden(localStorage.getItem(hideKey(orgId)) === "1");
    } catch { setHidden(false); }
  }, [orgId]);

  const closeWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem(seenKey(orgId), "1"); } catch { /* ignore */ }
  };
  const hideSteps = () => {
    setHidden(true);
    try { localStorage.setItem(hideKey(orgId), "1"); } catch { /* ignore */ }
  };

  const SLIDES = [
    {
      icon: Rocket, title: `Bem-vindo ao ZeroMaka, ${profile.name.split(" ")[0]}`,
      body: "Vamos pôr as finanças do teu negócio em ordem. Em poucos minutos ficas a saber exatamente quanto tens, quanto te devem e quanto deves.",
    },
    {
      icon: Wallet, title: "Primeiro: onde está o dinheiro",
      body: "Cria as tuas contas (banco, carteira móvel, caixa). Todos os lançamentos saem ou entram numa conta — é daí que vem o teu saldo real.",
    },
    {
      icon: FileText, title: "Depois: quem te deve e a quem deves",
      body: "Regista clientes e fornecedores, e emite faturas. O ZeroMaka separa sempre o dinheiro que já tens do dinheiro que ainda vais receber.",
    },
    {
      icon: Sparkles, title: "E o imposto fica tratado",
      body: "Ao marcar uma fatura como venda, o imposto do teu regime é calculado automaticamente e mostrado à parte — para não gastares dinheiro que é do Estado.",
    },
  ];

  return (
    <>
      {/* ---------- Checklist Primeiros passos ---------- */}
      {!hidden && !allDone && (
        <section className="card border-maka-500/30 bg-maka-500/[0.04] p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-maka-500/15 flex items-center justify-center text-maka-400 shrink-0"><Rocket size={18} /></div>
              <div>
                <h2 className="font-semibold text-[15px] leading-tight">Primeiros passos</h2>
                <p className="text-[12px] text-ink-500 mt-0.5">Completa a configuração para o ZeroMaka funcionar a 100%.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold text-maka-400">{doneCount} de {steps.length}</span>
              <button onClick={hideSteps} className="text-ink-500 hover:text-ink-300" title="Esconder este guia"><X size={16} /></button>
            </div>
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full bg-maka-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>

          <ol className="mt-4 space-y-1.5">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isNext = !s.done && steps.findIndex(x => !x.done) === i;
              return (
                <li key={s.id} className={`rounded-lg border p-3 transition-colors ${
                  s.done ? "border-ink-800 opacity-60"
                  : isNext ? "border-maka-500/40 bg-maka-500/[0.06]"
                  : "border-ink-800"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                      s.done ? "bg-emerald-500/15 text-emerald-400" : "bg-ink-800 text-ink-400"}`}>
                      {s.done ? <Check size={14} /> : <Icon size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${s.done ? "line-through text-ink-500" : ""}`}>
                        {i + 1}. {s.title}
                      </div>
                      {!s.done && <p className="text-[11px] leading-snug text-ink-500 mt-1">{s.why}</p>}
                    </div>
                    {!s.done && (
                      <Link href={s.href} className={`shrink-0 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 flex items-center gap-1 ${
                        isNext ? "bg-maka-500 text-onbrand hover:bg-maka-400" : "border border-ink-700 text-ink-300 hover:bg-ink-800"}`}>
                        {s.cta} <ChevronRight size={12} />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ---------- Modal de boas-vindas ---------- */}
      {showWelcome && (() => {
        const S = SLIDES[slide]; const Icon = S.icon; const last = slide === SLIDES.length - 1;
        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="card max-w-md w-full p-6 border-maka-500/40">
              <div className="flex justify-between items-start">
                <div className="h-12 w-12 rounded-xl bg-maka-500/15 flex items-center justify-center text-maka-400"><Icon size={24} /></div>
                <button onClick={closeWelcome} className="text-ink-500 hover:text-ink-300" title="Saltar"><X size={18} /></button>
              </div>
              <h2 className="font-display text-xl mt-4 leading-tight">{S.title}</h2>
              <p className="text-sm text-ink-300 mt-2.5 leading-relaxed">{S.body}</p>

              <div className="flex items-center justify-between mt-6">
                <div className="flex gap-1.5">
                  {SLIDES.map((_, i) => (
                    <button key={i} onClick={() => setSlide(i)} aria-label={`Passo ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-maka-500" : "w-1.5 bg-ink-700 hover:bg-ink-600"}`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  {!last && <button onClick={closeWelcome} className="btn-ghost text-xs px-3 py-1.5">Saltar</button>}
                  <button onClick={() => last ? closeWelcome() : setSlide(slide + 1)} className="btn-primary text-xs px-3 py-1.5">
                    {last ? "Começar" : "Seguinte"} <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
