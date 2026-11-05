"use client";
import Link from "next/link";
import { LucideIcon, ArrowUpRight } from "lucide-react";

export type Tone = "neutral" | "pos" | "neg" | "warn" | "brand";

const TONE: Record<Tone, { value: string; chip: string; card: string }> = {
  neutral: { value: "text-ink-100", chip: "bg-ink-800 text-ink-400", card: "stat-card-neutral" },
  pos: { value: "text-emerald-400", chip: "bg-emerald-500/10 text-emerald-400", card: "stat-card-positive" },
  neg: { value: "text-red-400", chip: "bg-red-500/10 text-red-400", card: "stat-card-negative" },
  warn: { value: "text-amber-400", chip: "bg-amber-500/10 text-amber-400", card: "stat-card-warning" },
  brand: { value: "text-maka-400", chip: "bg-maka-500/10 text-maka-400", card: "stat-card-brand" },
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
      <div className="stat-card-head">
        <div className="stat-card-label">{label}</div>
        {Icon && <div className={`stat-card-icon ${t.chip}`}><Icon size={15} strokeWidth={1.8} /></div>}
      </div>
      <div className={`stat-card-value ${t.value}`}>{value}</div>
      {hint && <p className="stat-card-hint">{hint}</p>}
      {(footer || href) && (
        <div className="stat-card-footer">
          {footer ? <span>{footer}</span> : <span />}
          {href ? <span className="inline-flex items-center gap-1 font-semibold text-maka-400">Ver detalhe <ArrowUpRight size={12} /></span> : null}
        </div>
      )}
    </>
  );

  const cls = `card dashboard-stat-card ${t.card}`;
  return href
    ? <Link href={href} className={`${cls} card-hover`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Cabeçalho de secção do dashboard: título + explicação do grupo. */
export function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="dashboard-section-head">
      <div>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {action ? <div className="dashboard-section-action">{action}</div> : null}
    </div>
  );
}
