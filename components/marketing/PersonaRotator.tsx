"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardList, Landmark, PiggyBank, ShieldCheck, TrendingUp, Wallet } from "lucide-react";

const DURACAO = 6000;

type Linha = { rotulo: string; valor: string; destaque?: boolean; tom?: "pos" | "neg" };

type Persona = {
  quem: string;
  acao: string;
  detalhe: string;
  icone: typeof Wallet;
  painel: { titulo: string; linhas: Linha[]; rodape: string };
};

const PERSONAS: Persona[] = [
  {
    quem: "O gerente",
    acao: "sabe quanto pode gastar hoje",
    detalhe: "Ao saldo descontam-se reservas, compromissos e a reserva mínima. Sobra um número em que pode confiar.",
    icone: ShieldCheck,
    painel: {
      titulo: "Disponível de verdade",
      linhas: [
        { rotulo: "Saldo em contas e caixa", valor: "17.550.000,00" },
        { rotulo: "− Reservas ativas", valor: "3.200.000,00" },
        { rotulo: "− Compromissos a pagar", valor: "2.360.000,00" },
        { rotulo: "− Reserva mínima", valor: "500.000,00" },
        { rotulo: "Pode gastar", valor: "11.490.000,00", destaque: true },
      ],
      rodape: "Atualiza sozinho a cada lançamento.",
    },
  },
  {
    quem: "O contabilista",
    acao: "fecha o mês sem reconstruir tudo",
    detalhe: "Resultado, fluxo de caixa e apuramento de impostos prontos, com filtros por período e exportação.",
    icone: TrendingUp,
    painel: {
      titulo: "Fecho de agosto",
      linhas: [
        { rotulo: "Receitas do mês", valor: "28.400.000,00", tom: "pos" },
        { rotulo: "Despesas do mês", valor: "12.650.000,00", tom: "neg" },
        { rotulo: "Imposto a entregar", valor: "4.260.000,00" },
        { rotulo: "Resultado", valor: "11.490.000,00", destaque: true },
      ],
      rodape: "Exporta em PDF e Excel.",
    },
  },
  {
    quem: "A equipa",
    acao: "pede fundos antes de gastar",
    detalhe: "Requisição com requisitante e responsável. Ao aprovar, a despesa é criada — controlo à entrada, não auditoria à saída.",
    icone: ClipboardList,
    painel: {
      titulo: "Requisições pendentes",
      linhas: [
        { rotulo: "Combustível · João", valor: "150.000,00" },
        { rotulo: "Material de escritório · Ana", valor: "85.000,00" },
        { rotulo: "Entrega de mercadoria · Pedro", valor: "40.000,00" },
        { rotulo: "Total a aguardar aprovação", valor: "275.000,00", destaque: true },
      ],
      rodape: "Nada sai do caixa sem passar por aqui.",
    },
  },
  {
    quem: "O sócio",
    acao: "acompanha o capital que entrou",
    detalhe: "Aportes e retiradas por sócio, tratados como passivo e fora do resultado — não inflacionam o lucro.",
    icone: Landmark,
    painel: {
      titulo: "Capital dos sócios",
      linhas: [
        { rotulo: "Aportes acumulados", valor: "8.000.000,00", tom: "pos" },
        { rotulo: "Retiradas", valor: "1.200.000,00", tom: "neg" },
        { rotulo: "Saldo a favor dos sócios", valor: "6.800.000,00", destaque: true },
      ],
      rodape: "Separado do lucro da empresa.",
    },
  },
];

export default function PersonaRotator() {
  const [ativo, setAtivo] = useState(0);
  const [auto, setAuto] = useState(true);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  // Sem movimento automático para quem o pediu ao sistema.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => setAtivo((i) => (i + 1) % PERSONAS.length), DURACAO);
    return () => clearTimeout(t);
  }, [ativo, auto]);

  // Escolher uma persona à mão pára a rotação: quem está a ler não quer que
  // o conteúdo lhe fuja debaixo dos olhos.
  const escolher = useCallback((i: number) => { setAtivo(i); setAuto(false); }, []);

  const teclado = (e: React.KeyboardEvent) => {
    const anterior = (ativo - 1 + PERSONAS.length) % PERSONAS.length;
    const seguinte = (ativo + 1) % PERSONAS.length;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); escolher(seguinte); botoes.current[seguinte]?.focus(); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); escolher(anterior); botoes.current[anterior]?.focus(); }
  };

  const p = PERSONAS[ativo];

  return (
    <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-6 lg:gap-10 items-start">
      <div role="tablist" aria-label="Quem usa o ZeroMaka" aria-orientation="vertical"
        onKeyDown={teclado} className="space-y-1">
        {PERSONAS.map((persona, i) => {
          const selecionado = i === ativo;
          return (
            <button
              key={persona.quem}
              ref={(el) => { botoes.current[i] = el; }}
              role="tab"
              aria-selected={selecionado}
              aria-controls="painel-persona"
              tabIndex={selecionado ? 0 : -1}
              onClick={() => escolher(i)}
              onMouseEnter={() => setAuto(false)}
              className={`relative w-full text-left pl-5 pr-4 py-4 rounded-r-lg transition-colors ${
                selecionado ? "bg-ink-900" : "hover:bg-ink-900/50"}`}>
              {/* Barra à esquerda: cinzenta em repouso, laranja a preencher quando ativa */}
              <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-ink-800 overflow-hidden">
                {selecionado && (
                  <span
                    key={`${ativo}-${auto}`}
                    className={`block h-full w-full bg-maka-500 ${auto ? "persona-progresso" : ""}`}
                    style={auto ? { animationDuration: `${DURACAO}ms` } : undefined}
                  />
                )}
              </span>

              <span className={`block font-display text-lg tracking-tight transition-colors ${
                selecionado ? "text-ink-100" : "text-ink-500"}`}>
                {persona.quem}
              </span>
              <span className={`block text-sm mt-0.5 transition-colors ${
                selecionado ? "text-maka-400" : "text-ink-600"}`}>
                {persona.acao}
              </span>
            </button>
          );
        })}
      </div>

      <div id="painel-persona" role="tabpanel" aria-live="polite" className="min-w-0">
        <div key={ativo} className="card p-6 sm:p-7 rise">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-maka-500/15 text-maka-400">
              <p.icone size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg tracking-tight">{p.painel.titulo}</h3>
              <p className="mt-1 text-sm text-ink-400 leading-relaxed">{p.detalhe}</p>
            </div>
          </div>

          <dl className="mt-6 divide-y divide-ink-800">
            {p.painel.linhas.map((l) => (
              <div key={l.rotulo} className={`flex items-baseline justify-between gap-4 py-2.5 ${
                l.destaque ? "pt-3" : ""}`}>
                <dt className={`text-sm ${l.destaque ? "font-semibold text-maka-300" : "text-ink-400"}`}>{l.rotulo}</dt>
                <dd className={`tabular-nums whitespace-nowrap ${
                  l.destaque ? "font-display text-lg text-maka-400"
                  : l.tom === "pos" ? "text-emerald-400 font-medium"
                  : l.tom === "neg" ? "text-red-400 font-medium" : "font-medium"}`}>
                  Kz {l.valor}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-500">
            <ArrowRight size={12} aria-hidden="true" /> {p.painel.rodape}
          </p>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-600">
          <PiggyBank size={12} aria-hidden="true" /> Valores de demonstração — nenhum dado real é mostrado nesta página.
        </p>
      </div>
    </div>
  );
}
