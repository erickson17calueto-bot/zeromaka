// Camada de domínio de relatórios — partilhada por UI, API, PDF e Excel.
// O cálculo é feito no servidor (funções PostgreSQL); aqui só definimos contratos.

export type ReportType = "income_statement" | "cash_flow_statement" | "tax_control" | "aging";

export const REPORT_RPC: Record<ReportType, string> = {
  income_statement: "report_income_cash",
  cash_flow_statement: "report_cash_flow",
  tax_control: "report_tax_control",
  aging: "report_aging",
};

export const REPORT_LABEL: Record<ReportType, string> = {
  income_statement: "Demonstração de Resultado de Caixa",
  cash_flow_statement: "Demonstração do Fluxo de Caixa",
  tax_control: "Controlo Fiscal (interno)",
  aging: "Mapa de Antiguidade de Saldos",
};

export const REPORT_TYPES: ReportType[] = ["income_statement", "cash_flow_statement", "tax_control", "aging"];

export function isReportType(v: unknown): v is ReportType {
  return typeof v === "string" && (REPORT_TYPES as string[]).includes(v);
}

export interface ReportRequest {
  reportType: ReportType;
  organizationId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  includeReversed?: boolean;
  format: "pdf" | "xlsx";
}

// Resultado devolvido pelas funções PostgreSQL (JSON). Estrutura mínima comum.
export interface ReportMeta {
  report: ReportType;
  title: string;
  start: string;
  end: string;
  currency: string;
  basis?: string;
  method?: string;
  regime?: string;
  warnings: string[];
  include_reversed?: boolean;
}
export interface ReportResult {
  meta: ReportMeta;
  [key: string]: unknown;
}

// Forma uniforme dos relatórios v2 (secções + totais, com comparação)
export interface StmtLine {
  label: string;
  current: number;
  comparison: number | null;
  difference: number | null;
  emphasis?: boolean;
  /** Chave estável da linha; quando existe, permite abrir o detalhe (drill-down). */
  key?: string;
}

/** Um documento que compõe uma linha de relatório. */
export interface DrillRow {
  data: string;
  numero: string;
  descricao: string;
  contacto: string;
  valor: number;
  imposto?: number;
  dias?: number;
}
export interface DrillResult {
  rows: DrillRow[];
  total: number;
  report: string;
  key: string;
}
export interface StmtSection {
  title: string;
  lines: StmtLine[];
  subtotal: StmtLine | null;
}
export interface StatementResult {
  meta: ReportMeta & { has_comparison: boolean; cmp_start?: string | null; cmp_end?: string | null };
  sections: StmtSection[];
  totals: StmtLine[];
}

export interface ReportRequestBody {
  reportType: ReportType;
  organizationId: string;
  startDate: string;
  endDate: string;
  cmpStartDate?: string | null;
  cmpEndDate?: string | null;
  includeReversed?: boolean;
  format?: "pdf" | "xlsx";
}

export const AVISO_LEGAL =
  "Relatório interno de gestão. Não substitui demonstrações financeiras certificadas nem declarações fiscais oficiais.";
