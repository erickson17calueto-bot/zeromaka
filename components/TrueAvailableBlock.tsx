"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fmtKz, fmtDate, SafetyState, SAFETY_STATE_LABEL } from "@/lib/data";
import { CircleGauge, Info, X, Beaker, ArrowRight } from "lucide-react";

const STATE_STYLE: Record<SafetyState, { text: string; border: string; card: string }> = {
  safe: { text: "text-emerald-400", border: "border-emerald-500/30", card: "true-available-safe" },
  warning: { text: "text-amber-400", border: "border-amber-500/30", card: "true-available-warning" },
  critical: { text: "text-red-400", border: "border-red-500/30", card: "true-available-critical" },
};

export default function TrueAvailableBlock() {
  const { trueAvailable: tac, finSettings, refreshAvailable } = useStore();
  const [showCalc, setShowCalc] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [simExpense, setSimExpense] = useState("");
  const [simIncome, setSimIncome] = useState("");

  const st = tac ? STATE_STYLE[tac.safetyState] : STATE_STYLE.safe;
  const horizon = tac?.horizonDays ?? finSettings.horizonDays;

  const changeHorizon = async (h: number) => {
    setBusy(true);
    await refreshAvailable(h);
    setBusy(false);
  };

  // Simulação instantânea (não guarda nada). Recebível não conta como disponível.
  const simResult = useMemo(() => {
    if (!tac) return null;
    const expense = Number(simExpense) || 0;
    const income = Number(simIncome) || 0;
    return tac.trueAvailableCash - expense + income;
  }, [tac, simExpense, simIncome]);

  if (!tac) {
    return (
      <section className="card p-5">
        <div className="text-sm text-ink-500">A calcular o Disponível de verdade…</div>
      </section>
    );
  }

  const rows: [string, number, boolean][] = [
    ["Saldo atual", tac.currentCashBalance, false],
    ["Reservas ativas", -tac.activeReservesTotal, true],
    ["Compromissos não cobertos", -tac.uncoveredCommitmentsTotal, true],
    ["Requisições aprovadas", -tac.approvedRequisitionsTotal, true],
    ["Reserva mínima", -tac.minimumCashBuffer, true],
  ];

  return (
    <section className={`card true-available-card ${st.card}`}>
      <div className="true-available-top">
        <div className="min-w-0">
          <div className="true-available-title">
            <span className="true-available-icon"><CircleGauge size={16} strokeWidth={1.8} /></span>
            Disponível de verdade
            <span className={`true-available-status ${st.text} border ${st.border}`}>{SAFETY_STATE_LABEL[tac.safetyState]}</span>
          </div>
          <div className={`true-available-value ${st.text}`}>{fmtKz(tac.trueAvailableCash)}</div>
          <p className="true-available-copy">Estimativa do valor que podes usar sem comprometer os pagamentos do período escolhido.</p>
        </div>
        <div className="true-available-controls">
          <div className="true-available-horizon" aria-label="Período da estimativa">
            {[7, 15, 30].map(h => (
              <button key={h} onClick={() => changeHorizon(h)} disabled={busy}
                className={horizon === h ? "true-available-horizon-active" : ""}>
                {h}d
              </button>
            ))}
          </div>
          <div className="true-available-actions">
            <button onClick={() => setShowSim(true)} className="btn-ghost"><Beaker size={14} /> Simular</button>
            <button onClick={() => setShowCalc(true)} className="btn-ghost"><Info size={14} /> Ver cálculo</button>
          </div>
        </div>
      </div>

      <div className="true-available-metrics">
        <div><span>Saldo atual</span><strong>{fmtKz(tac.currentCashBalance)}</strong></div>
        <div><span>Reservado</span><strong>{fmtKz(tac.activeReservesTotal)}</strong></div>
        <div><span>Compromissos ({horizon}d)</span><strong>{fmtKz(tac.uncoveredCommitmentsTotal)}</strong></div>
        <div><span>Reserva mínima</span><strong>{fmtKz(tac.minimumCashBuffer)}</strong></div>
      </div>

      {showCalc && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCalc(false)}>
          <div className="card max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Como chegámos a este valor</h3>
              <button onClick={() => setShowCalc(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-1.5 text-sm">
              {rows.map(([label, val, neg]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-ink-800">
                  <span className="text-ink-300">{label}</span>
                  <span className={`font-semibold ${neg && val !== 0 ? "text-red-400" : ""}`}>{val < 0 ? "−" : ""}{fmtKz(Math.abs(val))}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 mt-1">
                <span className="font-semibold">Disponível de verdade</span>
                <span className={`text-lg font-semibold ${st.text}`}>{fmtKz(tac.trueAvailableCash)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-[12px]">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mb-1">Contas consideradas</div>
                {tac.breakdown.accounts.map(a => <div key={a.id} className="flex justify-between text-ink-400"><span>{a.name}{a.archived ? " (arquivada)" : ""}</span><span>{fmtKz(a.balance)}</span></div>)}
              </div>
              {tac.breakdown.reserves.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mb-1">Reservas</div>
                  {tac.breakdown.reserves.map(r => <div key={r.id} className="flex justify-between text-ink-400"><span>{r.name}{r.obligation_id ? " (ligada)" : ""}</span><span>−{fmtKz(r.amount)}</span></div>)}
                </div>
              )}
              {tac.breakdown.obligations.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mb-1">Contas a pagar no horizonte</div>
                  {tac.breakdown.obligations.map(o => (
                    <div key={o.id} className="flex justify-between text-ink-400">
                      <span>{o.number} · vence {fmtDate(o.due_date)}{o.overdue ? " (vencida)" : ""}</span>
                      <span>−{fmtKz(o.uncovered)}{o.covered > 0 ? <span className="text-emerald-400"> ({fmtKz(o.covered)} coberto)</span> : null}</span>
                    </div>
                  ))}
                </div>
              )}
              {tac.breakdown.requisitions.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold mb-1">Requisições aprovadas</div>
                  {tac.breakdown.requisitions.map(r => <div key={r.id} className="flex justify-between text-ink-400"><span>{r.number}</span><span>−{fmtKz(r.amount)}</span></div>)}
                </div>
              )}
              <p className="text-[11px] text-ink-500 pt-2">Contas a receber <strong>não</strong> entram — só contam como disponível após o pagamento. <Link href="/app/cobrancas" className="text-maka-400 hover:underline">Ver cobranças <ArrowRight size={10} className="inline" /></Link></p>
            </div>
          </div>
        </div>
      )}

      {showSim && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowSim(false)}>
          <div className="card max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Simular decisão</h3>
              <button onClick={() => setShowSim(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <p className="text-[11px] text-ink-500 mb-4">Simulação instantânea — não cria movimentos nem altera dados.</p>
            <div className="space-y-4">
              <div><label className="label">E se gastar hoje (Kz)</label><input className="input" type="number" placeholder="0" value={simExpense} onChange={e => setSimExpense(e.target.value)} /></div>
              <div><label className="label">E se receber (pagamento efetivo) (Kz)</label><input className="input" type="number" placeholder="0" value={simIncome} onChange={e => setSimIncome(e.target.value)} /></div>
              <div className="rounded-lg border border-ink-800 p-4">
                <div className="flex justify-between text-sm"><span className="text-ink-400">Disponível atual</span><span className="font-semibold">{fmtKz(tac.trueAvailableCash)}</span></div>
                <div className="flex justify-between text-sm mt-2"><span className="text-ink-400">Após simulação</span>
                  <span className={`text-lg font-semibold ${(simResult ?? 0) <= 0 ? "text-red-400" : (simResult ?? 0) < tac.currentCashBalance * 0.2 ? "text-amber-400" : "text-emerald-400"}`}>{fmtKz(simResult ?? 0)}</span>
                </div>
                {(simResult ?? 0) <= 0 && <p className="text-[11px] text-red-400 mt-2">Esta despesa deixaria o disponível negativo — reservas ou compromissos ficariam descobertos.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
