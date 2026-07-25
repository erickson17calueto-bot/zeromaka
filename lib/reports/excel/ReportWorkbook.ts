import ExcelJS from "exceljs";
import { excelSafeText } from "../format";
import { AVISO_LEGAL, ReportResult } from "../types";

export interface DocContext {
  companyName: string; companyNif?: string; regimeLabel?: string;
  generatedByEmail: string; generatedAt: string; exportId: string; version: number;
  startDate: string; endDate: string; includeReversed: boolean;
}

const KZ = '#,##0.00';
type StmtRow = { label: string; amount: number | null; bold?: boolean; section?: boolean };

/* eslint-disable @typescript-eslint/no-explicit-any */
function statementRows(r: any): StmtRow[] {
  const rows: StmtRow[] = [];
  switch (r.meta.report) {
    case "income_statement":
      rows.push({ label: "RECEITAS", amount: null, section: true });
      (r.revenue.lines || []).forEach((l: any) => rows.push({ label: l.category, amount: Number(l.amount) }));
      rows.push({ label: "Receita total", amount: Number(r.revenue.total_revenue), bold: true });
      rows.push({ label: "DESPESAS", amount: null, section: true });
      (r.expenses.lines || []).forEach((l: any) => rows.push({ label: l.category, amount: -Number(l.amount) }));
      rows.push({ label: "Total de despesas", amount: -Number(r.expenses.total), bold: true });
      rows.push({ label: "Resultado do período", amount: Number(r.net_result), bold: true });
      break;
    case "cash_flow_statement":
      rows.push({ label: "OPERACIONAL", amount: null, section: true });
      rows.push({ label: "Recebimentos", amount: Number(r.operating.receipts) });
      rows.push({ label: "Pagamentos", amount: -Number(r.operating.payments) });
      rows.push({ label: "Fluxo operacional", amount: Number(r.operating.net), bold: true });
      rows.push({ label: "FINANCIAMENTO", amount: null, section: true });
      rows.push({ label: "Entradas de capital", amount: Number(r.financing.capital_in) });
      rows.push({ label: "Retiradas", amount: -Number(r.financing.capital_out) });
      rows.push({ label: "Fluxo de financiamento", amount: Number(r.financing.net), bold: true });
      rows.push({ label: "RECONCILIAÇÃO", amount: null, section: true });
      rows.push({ label: "Saldo inicial", amount: Number(r.opening_balance) });
      rows.push({ label: "Saldos iniciais e outros no período", amount: Number(r.other.net) });
      rows.push({ label: "Variação líquida", amount: Number(r.net_change), bold: true });
      rows.push({ label: "Saldo final em caixa e bancos", amount: Number(r.closing_balance), bold: true });
      break;
    case "tax_control":
      rows.push({ label: "Base de vendas tributáveis", amount: Number(r.taxable_base) });
      rows.push({ label: "Imposto sobre vendas (por dentro)", amount: Number(r.tax_collected) });
      rows.push({ label: "Receitas não-venda (sem imposto)", amount: Number(r.non_sale_income) });
      rows.push({ label: "Estimativa a entregar ao Estado", amount: Number(r.estimated_payable), bold: true });
      break;
  }
  return rows;
}

function kv(ws: ExcelJS.Worksheet, k: string, v: string) {
  const row = ws.addRow([k, excelSafeText(v)]);
  row.getCell(1).font = { bold: true, color: { argb: "FF78716C" } };
}

export async function buildWorkbook(report: ReportResult, ctx: DocContext): Promise<Buffer> {
  const r = report as any;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ZeroMaka"; wb.created = new Date(ctx.generatedAt);
  wb.title = `${r.meta.title} — ${ctx.companyName}`;

  // ---- Resumo ----
  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [{ width: 34 }, { width: 40 }];
  kv(resumo, "Empresa", ctx.companyName);
  if (ctx.companyNif) kv(resumo, "NIF", ctx.companyNif);
  if (ctx.regimeLabel) kv(resumo, "Regime", ctx.regimeLabel);
  kv(resumo, "Relatório", r.meta.title);
  kv(resumo, "Período", `${ctx.startDate} a ${ctx.endDate}`);
  kv(resumo, "Base", r.meta.basis === "cash" ? "Caixa" : (r.meta.basis || "—"));
  kv(resumo, "Moeda", r.meta.currency);
  kv(resumo, "Gerado em", ctx.generatedAt.slice(0, 10));
  kv(resumo, "Gerado por", ctx.generatedByEmail);
  kv(resumo, "Versão / ID", `v${ctx.version} · ${ctx.exportId.slice(0, 8)}`);
  resumo.addRow([]);
  const ind = resumo.addRow(["Principais indicadores", ""]); ind.getCell(1).font = { bold: true };
  const keyIndicators: [string, number][] =
    r.meta.report === "income_statement" ? [["Receita total", Number(r.revenue.total_revenue)], ["Total de despesas", Number(r.expenses.total)], ["Resultado", Number(r.net_result)]]
    : r.meta.report === "cash_flow_statement" ? [["Fluxo operacional", Number(r.operating.net)], ["Variação líquida", Number(r.net_change)], ["Saldo final", Number(r.closing_balance)]]
    : [["Base tributável", Number(r.taxable_base)], ["Imposto estimado", Number(r.estimated_payable)]];
  keyIndicators.forEach(([k, v]) => { const row = resumo.addRow([k, v]); row.getCell(2).numFmt = KZ; });
  resumo.addRow([]);
  (r.meta.warnings || []).forEach((w: string) => resumo.addRow(["Aviso", excelSafeText(w)]));
  resumo.addRow(["Aviso", AVISO_LEGAL]);

  // ---- Demonstração ----
  const dem = wb.addWorksheet("Demonstração", { views: [{ state: "frozen", ySplit: 1 }] });
  dem.columns = [{ header: "Rubrica", key: "label", width: 48 }, { header: "Valor (Kz)", key: "amount", width: 22 }];
  dem.getRow(1).font = { bold: true };
  dem.autoFilter = "A1:B1";
  for (const sr of statementRows(r)) {
    const row = dem.addRow({ label: excelSafeText(sr.label), amount: sr.amount });
    if (sr.amount !== null) row.getCell(2).numFmt = KZ;
    if (sr.bold) row.font = { bold: true };
    if (sr.section) { row.font = { bold: true }; row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F4" } }; }
  }
  dem.pageSetup = { fitToWidth: 1, printTitlesRow: "1:1" };

  // ---- Metodologia ----
  const met = wb.addWorksheet("Metodologia");
  met.columns = [{ width: 24 }, { width: 70 }];
  kv(met, "Base de elaboração", r.meta.basis === "cash" ? "Caixa" : (r.meta.basis || "—"));
  if (r.meta.method) kv(met, "Método", r.meta.method);
  kv(met, "Moeda", r.meta.currency);
  kv(met, "Reversões", ctx.includeReversed ? "Incluídas" : "Excluídas (efeito líquido)");
  met.addRow([]);
  (r.meta.warnings || []).forEach((w: string) => met.addRow(["Regra", excelSafeText(w)]));
  met.addRow(["Regra", AVISO_LEGAL]);

  // ---- Parâmetros ----
  const par = wb.addWorksheet("Parâmetros");
  par.columns = [{ width: 26 }, { width: 44 }];
  kv(par, "reportType", r.meta.report);
  kv(par, "startDate", ctx.startDate);
  kv(par, "endDate", ctx.endDate);
  kv(par, "includeReversed", String(ctx.includeReversed));
  kv(par, "exportId", ctx.exportId);
  kv(par, "version", String(ctx.version));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
