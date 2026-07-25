import ExcelJS from "exceljs";
import { excelSafeText } from "../format";
import { AVISO_LEGAL, StatementResult, StmtLine } from "../types";

export interface DocContext {
  companyName: string; companyNif?: string; regimeLabel?: string;
  generatedByEmail: string; generatedAt: string; exportId: string; version: number;
  startDate: string; endDate: string; includeReversed: boolean;
  cmpStartDate?: string | null; cmpEndDate?: string | null;
}

const KZ = '#,##0.00;(#,##0.00)';
const HDR = "FF1D4ED8";      // azul cabeçalho
const HDR_TXT = "FFFFFFFF";
const BAND = "FFDBEAFE";     // banda de secção
const BAND_TXT = "FF1E3A8A";
const SUB = "FFEFF6FF";
const TOTAL = "FFDCFCE7";
const GREY = "FFF3F4F6";
const BORDER = "FFE5E7EB";

function thin() { return { style: "thin" as const, color: { argb: BORDER } }; }
function borderAll() { return { top: thin(), left: thin(), bottom: thin(), right: thin() }; }

export async function buildWorkbook(report: StatementResult, ctx: DocContext): Promise<Buffer> {
  const m = report.meta;
  const cmp = !!m.has_comparison;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ZeroMaka"; wb.created = new Date(ctx.generatedAt);
  wb.title = `${m.title} — ${ctx.companyName}`;

  const numCols = cmp ? 3 : 1;
  const lastCol = String.fromCharCode(65 + numCols); // A + n

  // ---------- Demonstração ----------
  const dem = wb.addWorksheet("Demonstração", { views: [{ state: "frozen", ySplit: 3 }] });
  dem.getColumn(1).width = 52;
  for (let i = 0; i < numCols; i++) dem.getColumn(2 + i).width = 20;

  // título (banda azul, merge)
  dem.mergeCells(`A1:${lastCol}1`);
  const tcell = dem.getCell("A1");
  tcell.value = `${m.title}  —  ${ctx.companyName}`;
  tcell.font = { bold: true, size: 13, color: { argb: HDR_TXT } };
  tcell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR } };
  tcell.alignment = { vertical: "middle" };
  dem.getRow(1).height = 22;
  dem.mergeCells(`A2:${lastCol}2`);
  const pcell = dem.getCell("A2");
  pcell.value = cmp
    ? `Período: ${ctx.startDate} a ${ctx.endDate}   |   Comparação: ${ctx.cmpStartDate} a ${ctx.cmpEndDate}`
    : `Período: ${ctx.startDate} a ${ctx.endDate}`;
  pcell.font = { color: { argb: "FF6B7280" }, size: 10 };

  // cabeçalho de colunas
  const head = ["Rubrica", "Atual (Kz)"]; if (cmp) head.push("Anterior (Kz)", "Diferença (Kz)");
  const hr = dem.addRow(head); // linha 3
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: "FF374151" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } }; c.border = borderAll(); });
  for (let i = 2; i <= numCols + 1; i++) hr.getCell(i).alignment = { horizontal: "right" };
  dem.autoFilter = `A3:${lastCol}3`;

  const writeLine = (l: StmtLine, opts: { band?: boolean; sub?: boolean; total?: boolean }) => {
    const vals: (string | number)[] = [excelSafeText(l.label), l.current];
    if (cmp) { vals.push(l.comparison ?? 0, l.difference ?? 0); }
    const row = dem.addRow(vals);
    row.eachCell((c, col) => {
      c.border = borderAll();
      if (col >= 2) c.numFmt = KZ;
      if (opts.total) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } }; c.font = { bold: true, size: 11 }; }
      else if (opts.sub) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB } }; c.font = { bold: true }; }
    });
    return row;
  };

  for (const sec of report.sections) {
    // banda de secção (merge)
    const bandRow = dem.addRow([sec.title, ...Array(numCols).fill("")]);
    dem.mergeCells(`A${bandRow.number}:${lastCol}${bandRow.number}`);
    const bc = dem.getCell(`A${bandRow.number}`);
    bc.font = { bold: true, color: { argb: BAND_TXT } };
    bc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    bc.border = borderAll();
    for (const l of sec.lines) writeLine(l, {});
    if (sec.subtotal) writeLine(sec.subtotal, { sub: true });
  }
  dem.addRow([]);
  for (const tl of report.totals) writeLine(tl, { total: true });
  dem.pageSetup = { fitToWidth: 1, printTitlesRow: "1:3", horizontalCentered: true };
  dem.headerFooter = { oddFooter: "&LZeroMaka&C&P/&N&R" + ctx.exportId.slice(0, 8) };

  // ---------- Resumo ----------
  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [{ width: 30 }, { width: 42 }];
  const kv = (k: string, v: string) => { const r = resumo.addRow([k, excelSafeText(v)]); r.getCell(1).font = { bold: true, color: { argb: "FF6B7280" } }; };
  kv("Empresa", ctx.companyName);
  if (ctx.companyNif) kv("NIF", ctx.companyNif);
  if (ctx.regimeLabel) kv("Regime", ctx.regimeLabel);
  kv("Relatório", m.title);
  kv("Período", `${ctx.startDate} a ${ctx.endDate}`);
  if (cmp) kv("Comparação", `${ctx.cmpStartDate} a ${ctx.cmpEndDate}`);
  kv("Base", m.basis === "cash" ? "Caixa" : (m.basis || "—"));
  kv("Moeda", m.currency);
  kv("Gerado em", ctx.generatedAt.slice(0, 10));
  kv("Gerado por", ctx.generatedByEmail);
  kv("Versão / ID", `v${ctx.version} · ${ctx.exportId.slice(0, 8)}`);
  resumo.addRow([]);
  const ind = resumo.addRow(["Indicadores principais", ""]); ind.getCell(1).font = { bold: true };
  for (const tl of report.totals) { const r = resumo.addRow([tl.label, tl.current]); r.getCell(2).numFmt = KZ; r.getCell(1).font = { bold: true }; }
  resumo.addRow([]);
  (m.warnings || []).forEach((w) => resumo.addRow(["Aviso", excelSafeText(w)]));
  resumo.addRow(["Aviso", AVISO_LEGAL]);

  // ---------- Metodologia ----------
  const met = wb.addWorksheet("Metodologia");
  met.columns = [{ width: 24 }, { width: 78 }];
  const mk = (k: string, v: string) => { const r = met.addRow([k, excelSafeText(v)]); r.getCell(1).font = { bold: true, color: { argb: "FF6B7280" } }; };
  mk("Base de elaboração", m.basis === "cash" ? "Caixa" : (m.basis || "—"));
  if (m.method) mk("Método", m.method);
  mk("Moeda", m.currency);
  mk("Reversões", ctx.includeReversed ? "Incluídas" : "Excluídas (efeito líquido)");
  met.addRow([]);
  (m.warnings || []).forEach((w) => met.addRow(["Regra", excelSafeText(w)]));
  met.addRow(["Regra", AVISO_LEGAL]);

  // ---------- Parâmetros ----------
  const par = wb.addWorksheet("Parâmetros");
  par.columns = [{ width: 26 }, { width: 44 }];
  const pk = (k: string, v: string) => { const r = par.addRow([k, excelSafeText(v)]); r.getCell(1).font = { bold: true, color: { argb: "FF6B7280" } }; };
  pk("reportType", m.report);
  pk("startDate", ctx.startDate); pk("endDate", ctx.endDate);
  if (cmp) { pk("cmpStartDate", ctx.cmpStartDate || ""); pk("cmpEndDate", ctx.cmpEndDate || ""); }
  pk("includeReversed", String(ctx.includeReversed));
  pk("exportId", ctx.exportId); pk("version", String(ctx.version));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
