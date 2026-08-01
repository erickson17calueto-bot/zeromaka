export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { FinancialPackDocument } from "@/lib/reports/pdf/ReportDocument";
import { StatementResult, LedgerResult } from "@/lib/reports/types";
import { exportFileName } from "@/lib/reports/format";
import { REGIMES, TaxRegime } from "@/lib/data";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Demonstrações incluídas, por esta ordem. Cada uma continua a ser calculada
// pela sua própria função no servidor — aqui só se juntam os resultados.
const PACK_RPCS = [
  "report_income_cash",
  "report_cash_flow",
  "report_tax_control",
  "report_aging",
] as const;

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad(401, "Não autenticado");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad(400, "Corpo inválido"); }

  const organizationId = String(body.organizationId || "");
  const startDate = String(body.startDate || "");
  const endDate = String(body.endDate || "");
  const cmpStartDate = body.cmpStartDate ? String(body.cmpStartDate) : null;
  const cmpEndDate = body.cmpEndDate ? String(body.cmpEndDate) : null;
  const includeLedgers = body.includeLedgers !== false; // por omissão inclui

  if (!UUID_RE.test(organizationId)) return bad(400, "Organização inválida");
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return bad(400, "Datas inválidas");
  if (startDate > endDate) return bad(400, "Intervalo de datas invertido");
  const hasCmp = !!(cmpStartDate && cmpEndDate);
  if (hasCmp) {
    if (!DATE_RE.test(cmpStartDate!) || !DATE_RE.test(cmpEndDate!)) return bad(400, "Datas de comparação inválidas");
    if (cmpStartDate! > cmpEndDate!) return bad(400, "Comparação com datas invertidas");
  }

  const baseArgs = { p_org_id: organizationId, p_start: startDate, p_end: endDate };
  const comparisonArgs = {
    p_cmp_start: hasCmp ? cmpStartDate : null,
    p_cmp_end: hasCmp ? cmpEndDate : null,
  };

  // Cada RPC revalida auth + organização + RLS por si própria.
  const statements: StatementResult[] = [];
  for (const rpc of PACK_RPCS) {
    const rpcArgs = rpc === "report_income_cash" || rpc === "report_aging"
      ? { ...baseArgs, ...comparisonArgs }
      : baseArgs;
    const { data, error } = await supabase.rpc(rpc, rpcArgs);
    if (error) {
      const denied = /permiss|acesso|autenticado/i.test(error.message);
      return bad(denied ? 403 : 400, denied ? "Sem acesso a esta organização" : `Falha ao calcular ${rpc}`);
    }
    statements.push(data as StatementResult);
  }

  // Extratos: um por conta não arquivada (a RLS já restringe à organização)
  const ledgers: LedgerResult[] = [];
  if (includeLedgers) {
    const { data: accounts } = await supabase
      .from("accounts").select("id, name")
      .eq("organization_id", organizationId).eq("is_archived", false)
      .order("name");
    for (const acc of accounts || []) {
      const { data, error } = await supabase.rpc("report_account_ledger", {
        p_org_id: organizationId, p_start: startDate, p_end: endDate, p_account_id: acc.id,
      });
      if (error) return bad(400, `Falha ao calcular o extrato de ${acc.name}`);
      ledgers.push(data as LedgerResult);
    }
  }

  const { data: company } = await supabase
    .from("companies").select("name, nif, regime").eq("organization_id", organizationId).single();

  const { count } = await supabase
    .from("report_exports").select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId).eq("report_type", "financial_pack");
  const version = (count || 0) + 1;

  const { data: logRow } = await supabase
    .from("report_exports")
    .insert({
      organization_id: organizationId, report_type: "financial_pack", format: "pdf",
      filters_json: { startDate, endDate, includeLedgers, statements: PACK_RPCS.length, ledgers: ledgers.length },
      version,
    })
    .select("id").single();
  const exportId = logRow?.id || "00000000";

  const regimeLabel = company?.regime ? REGIMES[company.regime as TaxRegime]?.short : undefined;
  const buffer = await renderToBuffer(
    FinancialPackDocument({
      pack: { statements, ledgers, start: startDate, end: endDate },
      ctx: {
        companyName: company?.name || "Empresa",
        companyNif: company?.nif || undefined,
        regimeLabel,
        generatedByEmail: user.email || "—",
        generatedAt: new Date().toISOString(),
        exportId, version,
        confidentiality: "Confidencial",
      },
    })
  );

  const filename = exportFileName(company?.name || "empresa", "Pacote Financeiro", startDate, endDate, version, "pdf");
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
