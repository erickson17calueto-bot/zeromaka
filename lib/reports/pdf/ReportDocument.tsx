/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { fmtMoney, fmtDatePt } from "../format";
import { AVISO_LEGAL, StatementResult, StmtLine } from "../types";

export interface PdfContext {
  companyName: string; companyNif?: string; regimeLabel?: string;
  generatedByEmail: string; generatedAt: string; exportId: string; version: number;
  confidentiality?: string;
}

const C = {
  ink: "#1f2937", muted: "#6b7280", line: "#e5e7eb",
  brand: "#ea580c",
  hdr: "#1d4ed8", hdrText: "#ffffff",
  band: "#dbeafe", bandText: "#1e3a8a",
  sub: "#eff6ff",
  totalBg: "#dcfce7", pos: "#166534", neg: "#b91c1c",
};

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 36, fontSize: 8.5, color: C.ink, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 6 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.brand },
  headerRight: { textAlign: "right", color: C.muted, fontSize: 8 },
  // cover
  cover: { marginTop: 110, alignItems: "center" },
  coverBrand: { fontSize: 28, fontFamily: "Helvetica-Bold", color: C.brand },
  coverTitleBar: { marginTop: 30, backgroundColor: C.hdr, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 4 },
  coverTitle: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#fff", textAlign: "center" },
  coverMeta: { fontSize: 10, color: C.muted, marginTop: 8 },
  coverBox: { marginTop: 34, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 16, width: 340 },
  coverLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  coverKey: { color: C.muted }, coverVal: { fontFamily: "Helvetica-Bold" },
  // statement title band
  titleBand: { backgroundColor: C.hdr, paddingVertical: 7, paddingHorizontal: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  titleBandText: { color: C.hdrText, fontFamily: "Helvetica-Bold", fontSize: 11 },
  titleBandSub: { color: "#dbeafe", fontSize: 8, marginTop: 1 },
  // table
  colHead: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.muted },
  sectionBand: { flexDirection: "row", backgroundColor: C.band, paddingVertical: 4, paddingHorizontal: 6, marginTop: 2 },
  sectionBandText: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: C.bandText },
  row: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.line },
  subRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, backgroundColor: C.sub, borderTopWidth: 0.5, borderTopColor: C.line },
  totalRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, backgroundColor: C.totalBg, marginTop: 3, borderRadius: 2 },
  cLabel: { flex: 1 },
  cNum: { width: 92, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  warn: { marginTop: 16, padding: 8, backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 3 },
  warnText: { fontSize: 7.5, color: "#92400e", marginBottom: 1 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, fontSize: 7, color: C.muted },
});

function num(v: number | null, opts?: { muted?: boolean; strong?: boolean }) {
  if (v === null || v === undefined) return <Text style={s.cNum}>-</Text>;
  const tone = v < 0 ? C.neg : v > 0 ? C.pos : C.ink;
  const color = opts?.muted ? C.muted : tone;
  return <Text style={opts?.strong ? [s.cNum, s.bold, { color }] : [s.cNum, { color }]}>{v === 0 ? "-" : fmtMoney(v)}</Text>;
}

function Header({ ctx, title, period }: { ctx: PdfContext; title: string; period: string }) {
  return (
    <View style={s.headerRow} fixed>
      <View><Text style={s.brand}>ZERO<Text style={{ color: C.ink }}>MAKA</Text></Text>
        <Text style={{ fontSize: 8, color: C.muted }}>{ctx.companyName}</Text></View>
      <View style={s.headerRight}><Text>{title}</Text><Text>{period}</Text></View>
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

function LineRow({ l, cmp, variant }: { l: StmtLine; cmp: boolean; variant: "line" | "sub" | "total" }) {
  const style = variant === "total" ? s.totalRow : variant === "sub" ? s.subRow : s.row;
  const strong = variant !== "line";
  return (
    <View style={style} wrap={false}>
      <Text style={variant === "total" ? [s.cLabel, s.bold, { fontSize: 10 }] : strong ? [s.cLabel, s.bold] : [s.cLabel]}>{l.label}</Text>
      {num(l.current, { strong })}
      {cmp && num(l.comparison, { muted: true, strong })}
      {cmp && num(l.difference, { strong })}
    </View>
  );
}

export function ReportDocument({ report, ctx }: { report: StatementResult; ctx: PdfContext }) {
  const m = report.meta;
  const cmp = !!m.has_comparison;
  const period = `${fmtDatePt(m.start)} — ${fmtDatePt(m.end)}`;
  const cmpPeriod = cmp && m.cmp_start && m.cmp_end ? `${fmtDatePt(m.cmp_start)} — ${fmtDatePt(m.cmp_end)}` : "";
  return (
    <Document title={`${m.title} — ${ctx.companyName}`} author="ZeroMaka" subject={m.title} creator="ZeroMaka" language="pt-AO">
      <Page size="A4" style={s.page}>
        <Footer ctx={ctx} />
        <View style={s.cover}>
          <Text style={s.coverBrand}>ZERO<Text style={{ color: C.ink }}>MAKA</Text></Text>
          <View style={s.coverTitleBar}><Text style={s.coverTitle}>{m.title}</Text></View>
          <Text style={s.coverMeta}>{period}{cmp ? `  ·  comparação: ${cmpPeriod}` : ""}</Text>
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

      <Page size="A4" style={s.page}>
        <Header ctx={ctx} title={m.title} period={period} />
        <Footer ctx={ctx} />
        <View style={s.titleBand}>
          <Text style={s.titleBandText}>{m.title}</Text>
          <Text style={s.titleBandSub}>{ctx.companyName} · {period}{cmp ? `  |  Comparação: ${cmpPeriod}` : ""}</Text>
        </View>
        <View style={s.colHead}>
          <Text style={[s.th, s.cLabel]}>Rubrica</Text>
          <Text style={[s.th, s.cNum]}>Atual (Kz)</Text>
          {cmp && <Text style={[s.th, s.cNum]}>Anterior</Text>}
          {cmp && <Text style={[s.th, s.cNum]}>Diferença</Text>}
        </View>

        {report.sections.map((sec, i) => (
          <View key={i}>
            <View style={s.sectionBand}><Text style={s.sectionBandText}>{sec.title}</Text></View>
            {sec.lines.map((l, j) => <LineRow key={j} l={l} cmp={cmp} variant="line" />)}
            {sec.subtotal && <LineRow l={sec.subtotal} cmp={cmp} variant="sub" />}
          </View>
        ))}

        {report.totals.map((tl, i) => <LineRow key={i} l={tl} cmp={cmp} variant="total" />)}

        <View style={s.warn}>
          <Text style={[s.warnText, s.bold]}>Notas metodológicas</Text>
          {(m.warnings || []).map((w, i) => <Text key={i} style={s.warnText}>• {w}</Text>)}
          <Text style={s.warnText}>• {AVISO_LEGAL}</Text>
        </View>
      </Page>
    </Document>
  );
}
