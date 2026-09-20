"use client";

import Link from "next/link";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { fmtKz } from "@/lib/data";

export type CashFlowPoint = {
  label: string;
  income: number;
  expense: number;
};

export default function CashFlowChart({ points }: { points: CashFlowPoint[] }) {
  const peak = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));
  const totalIncome = points.reduce((sum, point) => sum + point.income, 0);
  const totalExpense = points.reduce((sum, point) => sum + point.expense, 0);

  return (
    <section className="card cashflow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            Fluxo de caixa
            <span className="text-[10px] font-medium text-ink-500">6 meses</span>
          </div>
          <p className="text-[12px] text-ink-500 mt-1">Entradas e saídas efetivamente lançadas.</p>
        </div>
        <Link href="/app/relatorios" className="text-[11px] font-semibold text-maka-400 hover:text-maka-300 inline-flex items-center gap-1">
          Relatórios <ArrowUpRight size={13} />
        </Link>
      </div>

      <div className="mt-5 h-36 flex items-end gap-2 sm:gap-3" aria-label="Gráfico de entradas e saídas dos últimos seis meses">
        {points.map((point) => {
          const incomeHeight = Math.max(4, Math.round((point.income / peak) * 100));
          const expenseHeight = Math.max(4, Math.round((point.expense / peak) * 100));
          return (
            <div key={point.label} className="min-w-0 flex-1 h-full flex flex-col justify-end gap-1.5 group">
              <div className="flex h-[108px] items-end justify-center gap-1.5 rounded-md bg-ink-950/30 px-1.5 py-1.5 group-hover:bg-ink-800/55 transition-colors">
                <div className="cashflow-bar cashflow-income" style={{ height: `${incomeHeight}%` }} title={`${point.label}: entradas ${fmtKz(point.income)}`} />
                <div className="cashflow-bar cashflow-expense" style={{ height: `${expenseHeight}%` }} title={`${point.label}: saídas ${fmtKz(point.expense)}`} />
              </div>
              <span className="text-center text-[10px] text-ink-500 truncate">{point.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400"><TrendingUp size={12} /> Entradas</div>
          <div className="mt-1 text-sm font-semibold tabular-nums truncate">{fmtKz(totalIncome)}</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-red-400"><TrendingDown size={12} /> Saídas</div>
          <div className="mt-1 text-sm font-semibold tabular-nums truncate">{fmtKz(totalExpense)}</div>
        </div>
      </div>
    </section>
  );
}
