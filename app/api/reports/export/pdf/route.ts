export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument, LedgerDocument } from "@/lib/reports/pdf/ReportDocument";
import { REPORT_RPC, REPORT_LABEL, isReportType, isLedgerReport, StatementResult, LedgerResult } from "@/lib/reports/types";
import { exportFileName } from "@/lib/reports/format";
import { REGIMES, TaxRegime } from "@/lib/data";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad(401, "Não autenticado");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad(400, "Corpo inválido"); }

  const reportType = body.reportType;
  const organizationId = String(body.organizationId || "");
  const startDate = String(body.startDate || "");
  const endDate = String(body.endDate || "");
  const includeReversed = body.includeReversed === true;
  const cmpStartDate = body.cmpStartDate ? String(body.cmpStartDate) : null;
  const cmpEndDate = body.cmpEndDate ? String(body.cmpEndDate) : null;
  const accountId = body.accountId ? String(body.accountId) : null;

  if (!isReportType(reportType)) return bad(400, "Tipo de relatório desconhecido");
  // o extrato é sempre de uma conta concreta
  if (isLedgerReport(reportType) && !UUID_RE.test(accountId || "")) return bad(400, "Conta inválida");
  if (!UUID_RE.test(organizationId)) return bad(400, "Organização inválida");
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return bad(400, "Datas inválidas");
  if (startDate > endDate) return bad(400, "Intervalo de datas invertido");
  const hasCmp = !!(cmpStartDate && cmpEndDate);
  if (hasCmp) {
    if (!DATE_RE.test(cmpStartDate!) || !DATE_RE.test(cmpEndDate!)) return bad(400, "Datas de comparação inválidas");
    if (cmpStartDate! > cmpEndDate!) return bad(400, "Comparação com datas invertidas");
  }

  // Cálculo no servidor (RPC SECURITY INVOKER → valida auth + org + RLS)
  // o extrato tem outra assinatura (conta, sem comparação)
  const rpcArgs: Record<string, unknown> = isLedgerReport(reportType)
    ? { p_org_id: organizationId, p_start: startDate, p_end: endDate, p_account_id: accountId }
    : {
        p_org_id: organizationId, p_start: startDate, p_end: endDate,
        p_cmp_start: hasCmp ? cmpStartDate : null, p_cmp_end: hasCmp ? cmpEndDate : null,
      };
  if (reportType === "income_statement") rpcArgs.p_include_reversed = includeReversed;

  const { data: report, error } = await supabase.rpc(REPORT_RPC[reportType], rpcArgs);
  if (error) {
    // Erros de permissão da função (org não autorizada, etc.) → 403
    const denied = /permiss|acesso|autenticado/i.test(error.message);
    return bad(denied ? 403 : 400, denied ? "Sem acesso a esta organização" : "Falha ao calcular o relatório");
  }

  // Empresa (RLS: só a org do utilizador)
  const { data: company } = await supabase
    .from("companies").select("name, nif, regime").eq("organization_id", organizationId).single();

  // Versão = nº de exportações anteriores do mesmo tipo/período + 1
  const { count } = await supabase
    .from("report_exports").select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId).eq("report_type", reportType);
  const version = (count || 0) + 1;

  // Registar a exportação (auditoria) antes de gerar
  const { data: logRow } = await supabase
    .from("report_exports")
    .insert({
      organization_id: organizationId, report_type: reportType, format: "pdf",
      filters_json: { startDate, endDate, includeReversed }, version,
    })
    .select("id").single();
  const exportId = logRow?.id || "00000000";

  const regimeLabel = company?.regime ? REGIMES[company.regime as TaxRegime]?.short : undefined;
  const pdfCtx = {
    companyName: company?.name || "Empresa",
    companyNif: company?.nif || undefined,
    regimeLabel,
    generatedByEmail: user.email || "—",
    generatedAt: new Date().toISOString(),
    exportId,
    version,
    confidentiality: "Confidencial",
  };
  const buffer = await renderToBuffer(
    isLedgerReport(reportType)
      ? LedgerDocument({ report: report as LedgerResult, ctx: pdfCtx })
      : ReportDocument({ report: report as StatementResult, ctx: pdfCtx })
  );

  const filename = exportFileName(company?.name || "empresa", REPORT_LABEL[reportType], startDate, endDate, version, "pdf");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
