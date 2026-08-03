import { ArrowDownLeft, ArrowUpRight, Landmark, Smartphone, Wallet, Receipt } from "lucide-react";

// Demonstração estática. Todos os valores são inventados para ilustração —
// nunca são lidos dados reais de nenhuma empresa nesta página pública.
const CONTAS = [
  { nome: "BAI Empresa", saldo: "Kz 12.450.000,00", icon: Landmark, cor: "text-maka-400" },
  { nome: "Unitel Money", saldo: "Kz 3.850.000,00", icon: Smartphone, cor: "text-emerald-400" },
  { nome: "Caixa Físico", saldo: "Kz 1.250.000,00", icon: Wallet, cor: "text-yellow-400" },
];

const METRICAS = [
  { label: "Receitas do mês", valor: "Kz 28.400.000,00", nota: "+18% vs mês anterior", tom: "pos" as const, icon: ArrowDownLeft },
  { label: "Despesas do mês", valor: "Kz 12.650.000,00", nota: "+7% vs mês anterior", tom: "neg" as const, icon: ArrowUpRight },
  { label: "Imposto do Estado", valor: "Kz 4.260.000,00", nota: "Previsto este mês", tom: "neutro" as const, icon: Receipt },
];

export default function DashboardPreview() {
  return (
    <div aria-hidden="true" className="rounded-2xl border border-ink-800 bg-ink-900 p-4 sm:p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Visão geral</p>
        <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10px] font-semibold text-ink-500">
          Dados de demonstração
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CONTAS.map(({ nome, saldo, icon: Icon, cor }) => (
          <div key={nome} className="rounded-xl border border-ink-800 bg-ink-950 p-3.5">
            <div className="flex items-center gap-2 text-[12px] text-ink-400">
              <Icon size={14} className={cor} /> {nome}
            </div>
            <p className="mt-1.5 font-display text-base tracking-tight">{saldo}</p>
          </div>
        ))}

        <div className="rounded-xl border border-maka-500/40 bg-maka-500/10 p-3.5">
          <p className="text-[12px] text-maka-300">Disponível de verdade</p>
          <p className="mt-1.5 font-display text-base tracking-tight text-maka-400">Kz 11.490.000,00</p>
          <p className="mt-0.5 text-[11px] text-ink-500">Já sem reservas e compromissos</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {METRICAS.map(({ label, valor, nota, tom, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-ink-800 bg-ink-950 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
              <Icon size={12} aria-hidden="true" /> {label}
            </div>
            <p className="mt-1 font-display text-sm tracking-tight">{valor}</p>
            <p className={`mt-0.5 text-[10px] ${
              tom === "pos" ? "text-emerald-400" : tom === "neg" ? "text-red-400" : "text-ink-500"}`}>{nota}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
