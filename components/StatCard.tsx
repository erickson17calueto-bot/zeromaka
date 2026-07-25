"use client";
import Link from "next/link";
import { LucideIcon, ArrowUpRight } from "lucide-react";

export type Tone = "neutral" | "pos" | "neg" | "warn" | "brand";

const TONE: Record<Tone, { value: string; chip: string }> = {
  neutral: { value: "", chip: "bg-ink-800 text-ink-400" },
  pos: { value: "text-emerald-400", chip: "bg-emerald-500/10 text-emerald-400" },
  neg: { value: "text-red-400", chip: "bg-red-500/10 text-red-400" },
  warn: { value: "text-amber-400", chip: "bg-amber-500/10 text-amber-400" },
  brand: { value: "text-maka-400", chip: "bg-maka-500/10 text-maka-400" },
};

export type StatCardProps = {
  /** Nome curto da métrica */
  label: string;
  /** Valor já formatado (ex.: "1.500 Kz") */
  value: string;
  /** Explicação em linguagem simples — o que este número significa */
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** Torna o cartão clicável */
  href?: string;
  /** Rodapé opcional (ex.: "3 documentos") */
  footer?: string;
};

export default function StatCard({ label, value, hint, icon: Icon, tone = "neutral", href, footer }: StatCardProps) {
  const t = TONE[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 font-bold leading-tight">{label}</div>
        {Icon && <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${t.chip}`}><Icon size={14} /></div>}
      </div>
      <div className={`mt-2 font-display text-xl leading-none ${t.value}`}>{value}</div>
      {hint && <p className="mt-2 text-[11px] leading-snug text-ink-500">{hint}</p>}
      {footer && <div className="mt-2 text-[11px] text-ink-400 font-medium">{footer}</div>}
      {href && (
        <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-maka-400">
          Ver detalhe <ArrowUpRight size={11} />
        </div>
      )}
    </>
  );

  const cls = "card p-4 flex flex-col h-full";
  return href
    ? <Link href={href} className={`${cls} hover:border-maka-500/50 transition-colors`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Cabeçalho de secção do dashboard: título + explicação do grupo. */
export function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
      <div>
        <h2 className="font-semibold text-[15px] leading-tight">{title}</h2>
        {hint && <p className="text-[12px] text-ink-500 mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
