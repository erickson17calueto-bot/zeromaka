/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { fmtMoney, fmtDatePt } from "../format";
import { AVISO_LEGAL, StatementResult, StmtLine, LedgerResult } from "../types";

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
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink },
  headerRight: { textAlign: "right", color: C.muted, fontSize: 8 },
  // ---- capa: sem caixas, informação distribuída na folha ----
  cover: { flex: 1 },
  coverAccent: { height: 4, width: 88, backgroundColor: C.brand, marginBottom: 24 },
  coverCompany: { fontSize: 19, fontFamily: "Helvetica-Bold", color: C.ink },
  coverCompanyMeta: { fontSize: 9, color: C.muted, marginTop: 5 },
  coverTitleWrap: { marginTop: 96 },
  coverKicker: { fontSize: 7.5, letterSpacing: 2.4, color: C.muted, fontFamily: "Helvetica-Bold" },
  coverTitle: { fontSize: 25, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 10, lineHeight: 1.25 },
  coverRule: { height: 1, backgroundColor: C.line, marginTop: 24, marginBottom: 20 },
  periodBlock: { flexDirection: "row" },
  periodItem: { marginRight: 44 },
  periodLabel: { fontSize: 7, letterSpacing: 1.6, color: C.muted, fontFamily: "Helvetica-Bold" },
  periodValue: { fontSize: 11.5, marginTop: 4 },
  coverNote: { marginTop: "auto", fontSize: 7.5, color: C.muted, lineHeight: 1.5, maxWidth: 380 },
  // grelha de metadados encostada ao fundo da capa
  metaGrid: { marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, flexDirection: "row" },
  metaCol: { flex: 1, paddingRight: 18 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5,
    borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  metaKey: { color: C.muted, fontSize: 8 },
  metaVal: { fontFamily: "Helvetica-Bold", fontSize: 8 },
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
      <View><Text style={s.brand}>{ctx.companyName}</Text>
        {ctx.companyNif ? <Text style={{ fontSize: 8, color: C.muted }}>NIF {ctx.companyNif}</Text> : null}</View>
      <View style={s.headerRight}><Text>{title}</Text><Text>{period}</Text></View>
    </View>
  );
}
// O ZeroMaka é identificado aqui, no rodapé — não na capa nem no cabeçalho.
function Footer({ ctx }: { ctx: PdfContext }) {
  return (
    <View style={s.footer} fixed>
      <Text>Processado por ZeroMaka · {ctx.confidentiality || "Confidencial"} · ID {ctx.exportId.slice(0, 8)} · v{ctx.version}</Text>
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

/** Capa partilhada por todos os relatórios. `extra` acrescenta pares na grelha. */
function Cover({ ctx, title, period, cmpPeriod, currency, basis, extra }: {
  ctx: PdfContext; title: string; period: string; cmpPeriod?: string;
  currency: string; basis?: string; extra?: { k: string; v: string }[];
}) {
  return (
    <View style={s.cover}>
      {/* A empresa é o sujeito do documento — o ZeroMaka identifica-se no rodapé. */}
      <View style={s.coverAccent} />
      <Text style={s.coverCompany}>{ctx.companyName}</Text>
      <Text style={s.coverCompanyMeta}>
        {[ctx.companyNif ? `NIF ${ctx.companyNif}` : null, ctx.regimeLabel].filter(Boolean).join("   ·   ")}
      </Text>

      <View style={s.coverTitleWrap}>
        <Text style={s.coverKicker}>RELATÓRIO DE GESTÃO</Text>
        <Text style={s.coverTitle}>{title}</Text>
        <View style={s.coverRule} />
        <View style={s.periodBlock}>
          <View style={s.periodItem}>
            <Text style={s.periodLabel}>PERÍODO</Text>
            <Text style={s.periodValue}>{period}</Text>
          </View>
          {cmpPeriod ? (
            <View style={s.periodItem}>
              <Text style={s.periodLabel}>COMPARAÇÃO</Text>
              <Text style={s.periodValue}>{cmpPeriod}</Text>
            </View>
          ) : null}
          {(extra || []).map((e, i) => (
            <View key={i} style={s.periodItem}>
              <Text style={s.periodLabel}>{e.k}</Text>
              <Text style={s.periodValue}>{e.v}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={s.coverNote}>{AVISO_LEGAL}</Text>

      <View style={s.metaGrid}>
        <View style={s.metaCol}>
          <View style={s.metaRow}><Text style={s.metaKey}>Moeda</Text><Text style={s.metaVal}>{currency} (Kz)</Text></View>
          {basis ? <View style={s.metaRow}><Text style={s.metaKey}>Base de preparação</Text><Text style={s.metaVal}>{basis === "cash" ? "Caixa" : basis}</Text></View> : null}
          <View style={s.metaRow}><Text style={s.metaKey}>Classificação</Text><Text style={s.metaVal}>{ctx.confidentiality || "Confidencial"}</Text></View>
        </View>
        <View style={s.metaCol}>
          <View style={s.metaRow}><Text style={s.metaKey}>Gerado em</Text><Text style={s.metaVal}>{fmtDatePt(ctx.generatedAt.slice(0, 10))}</Text></View>
          <View style={s.metaRow}><Text style={s.metaKey}>Gerado por</Text><Text style={s.metaVal}>{ctx.generatedByEmail}</Text></View>
          <View style={s.metaRow}><Text style={s.metaKey}>Documento</Text><Text style={s.metaVal}>v{ctx.version} · {ctx.exportId.slice(0, 8)}</Text></View>
        </View>
      </View>
    </View>
  );
}

/** Corpo de uma demonstração (banda de título + tabela). Partilhado pelo
    relatório individual e pelo pacote financeiro. */
function StatementBody({ report, ctx, showWarnings = true }:
  { report: StatementResult; ctx: PdfContext; showWarnings?: boolean }) {
  const m = report.meta;
  const cmp = !!m.has_comparison;
  const period = `${fmtDatePt(m.start)} — ${fmtDatePt(m.end)}`;
  const cmpPeriod = cmp && m.cmp_start && m.cmp_end ? `${fmtDatePt(m.cmp_start)} — ${fmtDatePt(m.cmp_end)}` : "";
  return (
    <>
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

      {showWarnings && (
        <View style={s.warn}>
          <Text style={[s.warnText, s.bold]}>Notas metodológicas</Text>
          {(m.warnings || []).map((w, i) => <Text key={i} style={s.warnText}>• {w}</Text>)}
          <Text style={s.warnText}>• {AVISO_LEGAL}</Text>
        </View>
      )}
    </>
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
        <Cover ctx={ctx} title={m.title} period={period} cmpPeriod={cmpPeriod}
          currency={m.currency} basis={m.basis} />
      </Page>

      <Page size="A4" style={s.page}>
        <Header ctx={ctx} title={m.title} period={period} />
        <Footer ctx={ctx} />
        <StatementBody report={report} ctx={ctx} />
      </Page>
    </Document>
  );
}

/* ─────────────── Extrato de conta ───────────────
   Forma própria: saldo corrido por linha, em vez de secções/totais. */
const l = StyleSheet.create({
  colHead: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 5, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: C.line },
  row: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 6,
    borderBottomWidth: 0.5, borderBottomColor: C.line },
  openRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, backgroundColor: "#f8fafc",
    borderBottomWidth: 1, borderBottomColor: C.line },
  closeRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, backgroundColor: C.totalBg,
    marginTop: 3, borderRadius: 2 },
  cDate: { width: 52 },
  cDoc: { flex: 1, paddingRight: 6 },
  cNum: { width: 74, textAlign: "right" },
  cBal: { width: 82, textAlign: "right" },
  docNum: { fontSize: 6.5, color: C.muted },
  strike: { textDecoration: "line-through" },
  faded: { color: C.muted },
});

/** Corpo do extrato (banda + tabela com saldo corrido). Partilhado pelo extrato
    individual e pelo pacote financeiro. */
function LedgerBody({ report, ctx, showWarnings = true }:
  { report: LedgerResult; ctx: PdfContext; showWarnings?: boolean }) {
  const m = report.meta;
  const period = `${fmtDatePt(m.start)} — ${fmtDatePt(m.end)}`;
  const bal = (v: number) => fmtMoney(v);
  return (
    <>
      <View style={s.titleBand}>
        <Text style={s.titleBandText}>{m.title} · {report.account.name}</Text>
        <Text style={s.titleBandSub}>{ctx.companyName} · {period}</Text>
      </View>

        <View style={l.colHead} fixed>
          <Text style={[s.th, l.cDate]}>Data</Text>
          <Text style={[s.th, l.cDoc]}>Documento</Text>
          <Text style={[s.th, l.cNum]}>Entrada</Text>
          <Text style={[s.th, l.cNum]}>Saída</Text>
          <Text style={[s.th, l.cBal]}>Saldo</Text>
        </View>

        <View style={l.openRow}>
          <Text style={[l.cDate, s.bold]}>—</Text>
          <Text style={[l.cDoc, s.bold]}>Saldo inicial em {fmtDatePt(m.start)}</Text>
          <Text style={l.cNum}>—</Text>
          <Text style={l.cNum}>—</Text>
          <Text style={[l.cBal, s.bold]}>{bal(report.opening)}</Text>
        </View>

        {report.rows.map((r, i) => {
          const anulado = r.estado === "reversed" || r.tipo === "reversal";
          return (
            <View key={i} style={l.row} wrap={false}>
              <Text style={anulado ? [l.cDate, l.faded] : [l.cDate]}>{fmtDatePt(r.data)}</Text>
              <View style={l.cDoc}>
                <Text style={r.estado === "reversed" ? [l.strike, l.faded] : anulado ? [l.faded] : []}>{r.descricao}</Text>
                <Text style={l.docNum}>
                  {r.numero}{r.contacto && r.contacto !== "—" ? ` · ${r.contacto}` : ""}
                  {r.estado === "reversed" ? " · ESTORNADO" : ""}{r.tipo === "reversal" ? " · ESTORNO" : ""}
                </Text>
              </View>
              <Text style={anulado ? [l.cNum, l.faded] : [l.cNum, { color: C.pos }]}>{r.entrada ? bal(r.entrada) : "—"}</Text>
              <Text style={anulado ? [l.cNum, l.faded] : [l.cNum, { color: C.neg }]}>{r.saida ? bal(r.saida) : "—"}</Text>
              <Text style={[l.cBal, s.bold]}>{bal(r.saldo)}</Text>
            </View>
          );
        })}

        {report.rows.length === 0 && (
          <View style={l.row}><Text style={[l.cDoc, l.faded]}>Sem movimentos neste período.</Text></View>
        )}

        <View style={l.closeRow}>
          <Text style={[l.cDate, s.bold]}>—</Text>
          <Text style={[l.cDoc, s.bold]}>Saldo final em {fmtDatePt(m.end)}</Text>
          <Text style={[l.cNum, s.bold, { color: C.pos }]}>{bal(report.inflow)}</Text>
          <Text style={[l.cNum, s.bold, { color: C.neg }]}>{bal(report.outflow)}</Text>
          <Text style={[l.cBal, s.bold, { fontSize: 10 }]}>{bal(report.closing)}</Text>
        </View>

        {showWarnings && (
          <View style={s.warn}>
            <Text style={[s.warnText, s.bold]}>Notas metodológicas</Text>
            {(m.warnings || []).map((w, i) => <Text key={i} style={s.warnText}>• {w}</Text>)}
            <Text style={s.warnText}>• {AVISO_LEGAL}</Text>
          </View>
        )}
    </>
  );
}

export function LedgerDocument({ report, ctx }: { report: LedgerResult; ctx: PdfContext }) {
  const m = report.meta;
  const period = `${fmtDatePt(m.start)} — ${fmtDatePt(m.end)}`;
  const title = `${m.title} — ${report.account.name}`;
  return (
    <Document title={`${title} — ${ctx.companyName}`} author="ZeroMaka" subject={m.title} creator="ZeroMaka" language="pt-AO">
      <Page size="A4" style={s.page}>
        <Footer ctx={ctx} />
        <Cover ctx={ctx} title={m.title} period={period} currency={m.currency} basis={m.basis}
          extra={[{ k: "CONTA", v: report.account.name }]} />
      </Page>
      <Page size="A4" style={s.page}>
        <Header ctx={ctx} title={title} period={period} />
        <Footer ctx={ctx} />
        <LedgerBody report={report} ctx={ctx} />
      </Page>
    </Document>
  );
}

/* ─────────────── Pacote Financeiro ───────────────
   Todas as demonstrações do período num só PDF, para entregar ao contabilista
   ou ao banco. Cada relatório continua a ser calculado no servidor pela sua
   própria função — aqui só se juntam os resultados. */
const pk = StyleSheet.create({
  idxTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  idxRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: C.line },
  idxName: { fontSize: 9.5 },
  idxNote: { fontSize: 8, color: C.muted },
  intro: { fontSize: 8.5, color: C.muted, lineHeight: 1.6, marginBottom: 16 },
});

export interface FinancialPack {
  statements: StatementResult[];
  ledgers: LedgerResult[];
  start: string;
  end: string;
}

export function FinancialPackDocument({ pack, ctx }: { pack: FinancialPack; ctx: PdfContext }) {
  const period = `${fmtDatePt(pack.start)} — ${fmtDatePt(pack.end)}`;
  const title = "Pacote Financeiro";
  return (
    <Document title={`${title} — ${ctx.companyName}`} author="ZeroMaka" subject={title} creator="ZeroMaka" language="pt-AO">
      <Page size="A4" style={s.page}>
        <Footer ctx={ctx} />
        <Cover ctx={ctx} title={title} period={period} currency="AOA" basis="cash" />
      </Page>

      {/* Índice — quem recebe percebe logo o que tem em mãos */}
      <Page size="A4" style={s.page}>
        <Header ctx={ctx} title={title} period={period} />
        <Footer ctx={ctx} />
        <View style={s.titleBand}>
          <Text style={s.titleBandText}>Conteúdo do pacote</Text>
          <Text style={s.titleBandSub}>{ctx.companyName} · {period}</Text>
        </View>
        <View style={{ marginTop: 14 }}>
          <Text style={pk.intro}>
            Este pacote reúne as demonstrações de gestão do período indicado, todas
            preparadas em base de caixa e calculadas a partir dos movimentos registados.
            Cada demonstração traz as suas próprias notas metodológicas. {AVISO_LEGAL}
          </Text>
          <Text style={pk.idxTitle}>Demonstrações</Text>
          {pack.statements.map((st, i) => (
            <View key={i} style={pk.idxRow}>
              <Text style={pk.idxName}>{i + 1}. {st.meta.title}</Text>
              <Text style={pk.idxNote}>{st.meta.has_comparison ? "com comparação" : "período simples"}</Text>
            </View>
          ))}
          {pack.ledgers.length > 0 && (
            <>
              <Text style={[pk.idxTitle, { marginTop: 18 }]}>Extratos de conta</Text>
              {pack.ledgers.map((lg, i) => (
                <View key={i} style={pk.idxRow}>
                  <Text style={pk.idxName}>{pack.statements.length + i + 1}. Extrato — {lg.account.name}</Text>
                  <Text style={pk.idxNote}>saldo final {fmtMoney(lg.closing)} Kz</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </Page>

      {pack.statements.map((st, i) => (
        <Page key={`st${i}`} size="A4" style={s.page}>
          <Header ctx={ctx} title={st.meta.title} period={period} />
          <Footer ctx={ctx} />
          <StatementBody report={st} ctx={ctx} />
        </Page>
      ))}

      {pack.ledgers.map((lg, i) => (
        <Page key={`lg${i}`} size="A4" style={s.page}>
          <Header ctx={ctx} title={`Extrato — ${lg.account.name}`} period={period} />
          <Footer ctx={ctx} />
          <LedgerBody report={lg} ctx={ctx} />
        </Page>
      ))}
    </Document>
  );
}
