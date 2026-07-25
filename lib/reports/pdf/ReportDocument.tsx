/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { fmtMoney, fmtDatePt } from "../format";
import { AVISO_LEGAL, ReportResult } from "../types";

export interface PdfContext {
  companyName: string;
  companyNif?: string;
  regimeLabel?: string;
  generatedByEmail: string;
  generatedAt: string; // ISO
  exportId: string;
  version: number;
  confidentiality?: string;
}

const C = {
  ink: "#1c1917", muted: "#78716c", line: "#e7e5e4", brand: "#ea580c",
  headBg: "#f5f5f4", pos: "#166534", neg: "#b91c1c",
};

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 40, fontSize: 9, color: C.ink, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 6 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.brand },
  headerRight: { textAlign: "right", color: C.muted, fontSize: 8 },
  cover: { marginTop: 120, alignItems: "center" },
  coverBrand: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.brand, marginBottom: 4 },
  coverTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 24, textAlign: "center" },
  coverMeta: { fontSize: 10, color: C.muted, marginTop: 6 },
  coverBox: { marginTop: 40, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 16, width: 320 },
  coverLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  coverKey: { color: C.muted }, coverVal: { fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  tableHead: { flexDirection: "row", backgroundColor: C.headBg, paddingVertical: 5, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: C.line },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.muted },
  row: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.line },
  totalRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: C.ink, marginTop: 2 },
  cLabel: { flex: 1 }, cVal: { width: 130, textAlign: "right", fontFamily: "Helvetica" },
  cValMono: { width: 130, textAlign: "right", fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  warn: { marginTop: 18, padding: 8, backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 3 },
  warnText: { fontSize: 8, color: "#92400e" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, fontSize: 7, color: C.muted },
});

function Money({ v, bold, tone }: { v: number; bold?: boolean; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? C.pos : tone === "neg" ? C.neg : C.ink;
  return <Text style={[bold ? s.cValMono : s.cVal, { color }]}>{fmtMoney(v)}</Text>;
}

function Header({ ctx, title, period }: { ctx: PdfContext; title: string; period: string }) {
  return (
    <View style={s.headerRow} fixed>
      <View>
        <Text style={s.brand}>ZERO<Text style={{ color: C.ink }}>MAKA</Text></Text>
        <Text style={{ fontSize: 8, color: C.muted }}>{ctx.companyName}</Text>
      </View>
      <View style={s.headerRight}>
        <Text>{title}</Text>
        <Text>{period}</Text>
      </View>
    </View>
  );
}

function Footer({ ctx }: { ctx: PdfContext }) {
  return (
    <View style={s.footer} fixed>
      <Text>{ctx.confidentiality || "Confidencial"} · {fmtDatePt(ctx.generatedAt.slice(0, 10))} · ID {ctx.exportId.slice(0, 8)} · v{ctx.version}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <View style={s.warn}>
      <Text style={[s.warnText, s.bold]}>Notas metodológicas</Text>
      {warnings.map((w, i) => <Text key={i} style={s.warnText}>• {w}</Text>)}
      <Text style={s.warnText}>• {AVISO_LEGAL}</Text>
    </View>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function IncomeBody({ r }: { r: any }) {
  return (
    <View>
      <Text style={s.sectionTitle}>Receitas</Text>
      <View style={s.tableHead}><Text style={[s.th, s.cLabel]}>Rubrica</Text><Text style={[s.th, s.cVal]}>Valor (Kz)</Text></View>
      {(r.revenue.lines || []).map((l: any, i: number) => (
        <View key={i} style={s.row}><Text style={s.cLabel}>{l.category}</Text><Money v={Number(l.amount)} tone="pos" /></View>
      ))}
      <View style={s.totalRow}><Text style={[s.cLabel, s.bold]}>Receita total</Text><Money v={Number(r.revenue.total_revenue)} bold /></View>

      <Text style={s.sectionTitle}>Despesas</Text>
      <View style={s.tableHead}><Text style={[s.th, s.cLabel]}>Rubrica</Text><Text style={[s.th, s.cVal]}>Valor (Kz)</Text></View>
      {(r.expenses.lines || []).map((l: any, i: number) => (
        <View key={i} style={s.row}><Text style={s.cLabel}>{l.category}</Text><Money v={-Number(l.amount)} tone="neg" /></View>
      ))}
      <View style={s.totalRow}><Text style={[s.cLabel, s.bold]}>Total de despesas</Text><Money v={-Number(r.expenses.total)} bold tone="neg" /></View>

      <View style={[s.totalRow, { borderTopWidth: 2 }]}>
        <Text style={[s.cLabel, s.bold, { fontSize: 11 }]}>Resultado do período</Text>
        <Money v={Number(r.net_result)} bold tone={Number(r.net_result) >= 0 ? "pos" : "neg"} />
      </View>
    </View>
  );
}

function CashFlowBody({ r }: { r: any }) {
  const Line = ({ label, v, tone, bold }: any) => (
    <View style={bold ? s.totalRow : s.row}><Text style={[s.cLabel, bold && s.bold]}>{label}</Text><Money v={v} bold={bold} tone={tone} /></View>
  );
  return (
    <View>
      <Text style={s.sectionTitle}>Atividades operacionais</Text>
      <Line label="Recebimentos" v={Number(r.operating.receipts)} tone="pos" />
      <Line label="Pagamentos" v={-Number(r.operating.payments)} tone="neg" />
      <Line label="Fluxo operacional" v={Number(r.operating.net)} bold />
      <Text style={s.sectionTitle}>Atividades de financiamento</Text>
      <Line label="Entradas de capital" v={Number(r.financing.capital_in)} tone="pos" />
      <Line label="Retiradas" v={-Number(r.financing.capital_out)} tone="neg" />
      <Line label="Fluxo de financiamento" v={Number(r.financing.net)} bold />
      <Text style={s.sectionTitle}>Investimento</Text>
      <View style={s.row}><Text style={s.cLabel}>{r.investing.note}</Text><Text style={s.cVal}>—</Text></View>
      <Text style={s.sectionTitle}>Reconciliação de caixa</Text>
      <Line label="Saldo inicial" v={Number(r.opening_balance)} />
      <Line label="Saldos iniciais e outros no período" v={Number(r.other.net)} />
      <Line label="Variação líquida do período" v={Number(r.net_change)} bold />
      <View style={[s.totalRow, { borderTopWidth: 2 }]}>
        <Text style={[s.cLabel, s.bold, { fontSize: 11 }]}>Saldo final em caixa e bancos</Text>
        <Money v={Number(r.closing_balance)} bold />
      </View>
    </View>
  );
}

function TaxBody({ r }: { r: any }) {
  const Line = ({ label, v, bold }: any) => (
    <View style={bold ? s.totalRow : s.row}><Text style={[s.cLabel, bold && s.bold]}>{label}</Text><Money v={v} bold={bold} /></View>
  );
  return (
    <View>
      <Text style={s.sectionTitle}>Apuramento sobre vendas — regime {r.regime}</Text>
      <Line label="Base de vendas tributáveis" v={Number(r.taxable_base)} />
      <Line label="Imposto sobre vendas (por dentro)" v={Number(r.tax_collected)} />
      <Line label="Receitas não-venda (sem imposto)" v={Number(r.non_sale_income)} />
      <View style={[s.totalRow, { borderTopWidth: 2 }]}>
        <Text style={[s.cLabel, s.bold, { fontSize: 11 }]}>Estimativa a entregar ao Estado</Text>
        <Money v={Number(r.estimated_payable)} bold />
      </View>
    </View>
  );
}

export function ReportDocument({ report, ctx }: { report: ReportResult; ctx: PdfContext }) {
  const m = report.meta;
  const period = `${fmtDatePt(m.start)} — ${fmtDatePt(m.end)}`;
  return (
    <Document title={`${m.title} — ${ctx.companyName}`} author="ZeroMaka" subject={m.title} creator="ZeroMaka" language="pt-AO">
      {/* Capa */}
      <Page size="A4" style={s.page}>
        <Footer ctx={ctx} />
        <View style={s.cover}>
          <Text style={s.coverBrand}>ZERO<Text style={{ color: C.ink }}>MAKA</Text></Text>
          <Text style={s.coverTitle}>{m.title}</Text>
          <Text style={s.coverMeta}>{period}</Text>
          <View style={s.coverBox}>
            <View style={s.coverLine}><Text style={s.coverKey}>Empresa</Text><Text style={s.coverVal}>{ctx.companyName}</Text></View>
            {ctx.companyNif ? <View style={s.coverLine}><Text style={s.coverKey}>NIF</Text><Text style={s.coverVal}>{ctx.companyNif}</Text></View> : null}
            {ctx.regimeLabel ? <View style={s.coverLine}><Text style={s.coverKey}>Regime</Text><Text style={s.coverVal}>{ctx.regimeLabel}</Text></View> : null}
            <View style={s.coverLine}><Text style={s.coverKey}>Moeda</Text><Text style={s.coverVal}>{m.currency}</Text></View>
            {m.basis ? <View style={s.coverLine}><Text style={s.coverKey}>Base</Text><Text style={s.coverVal}>{m.basis === "cash" ? "Caixa" : m.basis}</Text></View> : null}
            <View style={s.coverLine}><Text style={s.coverKey}>Gerado em</Text><Text style={s.coverVal}>{fmtDatePt(ctx.generatedAt.slice(0, 10))}</Text></View>
            <View style={s.coverLine}><Text style={s.coverKey}>Por</Text><Text style={s.coverVal}>{ctx.generatedByEmail}</Text></View>
            <View style={s.coverLine}><Text style={s.coverKey}>Versão / ID</Text><Text style={s.coverVal}>v{ctx.version} · {ctx.exportId.slice(0, 8)}</Text></View>
          </View>
        </View>
      </Page>
      {/* Corpo */}
      <Page size="A4" style={s.page}>
        <Header ctx={ctx} title={m.title} period={period} />
        <Footer ctx={ctx} />
        {m.report === "income_statement" && <IncomeBody r={report} />}
        {m.report === "cash_flow_statement" && <CashFlowBody r={report} />}
        {m.report === "tax_control" && <TaxBody r={report} />}
        <Warnings warnings={m.warnings || []} />
      </Page>
    </Document>
  );
}
