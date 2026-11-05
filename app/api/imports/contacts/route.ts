export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ContactImportFields, ExistingImportContact, ImportContactKind,
  createContactDuplicateIndex, parseContactPaymentTerm,
} from "@/lib/imports/contact-import";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_CHARS = 400_000;
const MAX_ROWS = 200;
const PAGE_SIZE = 500;

type ImportResult = { rowNumber: number; status: "created" | "duplicate" | "error"; message?: string };
type Prepared = { rowNumber: number; data: ContactImportFields; paymentTerm?: string };

function bad(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function prepare(raw: unknown, rowNumber: number): { value?: Prepared; error?: ImportResult } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: { rowNumber, status: "error", message: "Dados da linha inválidos" } };
  }
  const source = raw as Record<string, unknown>;
  const data: ContactImportFields = {
    name: text(source.name, 180),
    nif: text(source.nif, 50),
    phone: text(source.phone, 50),
    email: text(source.email, 180),
    location: text(source.location, 300),
    notes: text(source.notes, 500),
    paymentTerm: text(source.paymentTerm, 60),
  };
  if (!data.name) return { error: { rowNumber, status: "error", message: "Nome em falta" } };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: { rowNumber, status: "error", message: "E-mail inválido" } };
  }
  const paymentTerm = data.paymentTerm ? parseContactPaymentTerm(data.paymentTerm) : undefined;
  if (data.paymentTerm && !paymentTerm) {
    return { error: { rowNumber, status: "error", message: "Prazo de pagamento não reconhecido" } };
  }
  return { value: { rowNumber, data, paymentTerm } };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return bad(401, "Inicia sessão para importar contactos");

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_CHARS) return bad(413, "Este envio é demasiado grande");
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); }
  catch { return bad(400, "Pedido inválido"); }
  const orgId = text(body.orgId, 50);
  const kind = body.kind;
  const rows = body.rows;
  if (!UUID_RE.test(orgId)) return bad(400, "Organização inválida");
  if (kind !== "cliente" && kind !== "fornecedor") return bad(400, "Escolhe clientes ou fornecedores");
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) {
    return bad(400, `Envia entre 1 e ${MAX_ROWS} contactos por vez`);
  }

  const { data: canWrite, error: permissionError } = await supabase.rpc("user_can_write", {
    p_org_id: orgId, p_resource: "contacts",
  });
  if (permissionError) return bad(503, "Não foi possível verificar a permissão de escrita");
  if (!canWrite) return bad(403, "Sem permissão para importar contactos nesta organização");

  // Consulta novamente a lista na confirmação. A pré-visualização pode ficar
  // aberta enquanto outro utilizador acrescenta um contacto à organização.
  const existing: ExistingImportContact[] = [];
  for (let offset = 0; offset < 20_000; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from("contacts")
      .select("id,name,kind,nif,phone,email")
      .eq("organization_id", orgId)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return bad(503, "Não foi possível comparar os contactos existentes");
    existing.push(...(data || []).map(contact => ({
      id: contact.id, name: contact.name, kind: contact.kind,
      nif: contact.nif || undefined, phone: contact.phone || undefined, email: contact.email || undefined,
    })));
    if (!data || data.length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= 20_000) return bad(422, "A lista de contactos é demasiado grande para esta importação; divide o ficheiro");
  }

  const duplicateIndex = createContactDuplicateIndex(existing);
  const results: ImportResult[] = [];
  const prepared: Prepared[] = [];
  const usedRowNumbers = new Set<number>();
  for (const item of rows) {
    const source = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const rowNumber = Number(source.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 5000 || usedRowNumbers.has(rowNumber)) {
      return bad(400, "Número de linha inválido ou repetido");
    }
    usedRowNumbers.add(rowNumber);
    const checked = prepare(source.data, rowNumber);
    if (checked.error) { results.push(checked.error); continue; }
    const candidate = checked.value!;
    const duplicate = duplicateIndex.find(candidate.data);
    if (duplicate) {
      const label = { nif: "NIF", phone: "telefone", email: "e-mail", name: "nome" }[duplicate.field];
      results.push({ rowNumber, status: "duplicate", message: `${label} já usado por ${duplicate.match.name}` });
      continue;
    }
    prepared.push(candidate);
    duplicateIndex.add({ ...candidate.data, kind: kind as ImportContactKind });
  }

  // Uma falha de lote não deve esconder quais linhas falharam. O fallback
  // individual só corre quando o INSERT do lote foi rejeitado pelo Postgres.
  for (let offset = 0; offset < prepared.length; offset += 50) {
    const chunk = prepared.slice(offset, offset + 50);
    const values = chunk.map(({ data, paymentTerm }) => ({
      organization_id: orgId, kind, name: data.name,
      nif: data.nif || null, phone: data.phone || null, email: data.email || null,
      location: data.location || null, notes: data.notes || null,
      payment_term: paymentTerm || null,
    }));
    const { error } = await supabase.from("contacts").insert(values);
    if (!error) {
      results.push(...chunk.map(({ rowNumber }) => ({ rowNumber, status: "created" as const })));
      continue;
    }
    for (let i = 0; i < chunk.length; i++) {
      const single = await supabase.from("contacts").insert(values[i]);
      results.push(single.error
        ? { rowNumber: chunk[i].rowNumber, status: "error", message: single.error.message }
        : { rowNumber: chunk[i].rowNumber, status: "created" });
    }
  }

  results.sort((a, b) => a.rowNumber - b.rowNumber);
  return Response.json({
    results,
    created: results.filter(result => result.status === "created").length,
    duplicates: results.filter(result => result.status === "duplicate").length,
    errors: results.filter(result => result.status === "error").length,
  });
}
