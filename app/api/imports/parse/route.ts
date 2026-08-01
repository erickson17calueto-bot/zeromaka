export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Workbook } from "exceljs";
import { inflateSync } from "node:zlib";
import { createClient } from "@/lib/supabase/server";

type TargetType = "transaction" | "receivable" | "payable";
type Cell = string | number | boolean | Date | null | undefined;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

function bad(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function cellText(value: Cell | { text?: string; result?: Cell } | { richText?: { text?: string }[] }): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map(v => v.text || "").join("");
  }
  return String(value).trim();
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"' && quoted && next === '"') { field += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && (ch === "," || ch === ";")) { row.push(field.trim()); field = ""; continue; }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function rowsFromMatrix(matrix: string[][]): { headers: string[]; rows: Record<string, string>[] } {
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => h || "coluna_" + (i + 1));
  const rows = matrix.slice(1).filter(row => row.some(Boolean)).slice(0, MAX_ROWS).map(row => {
    const item: Record<string, string> = {};
    headers.forEach((header, i) => { item[header] = row[i] || ""; });
    return item;
  });
  return { headers, rows };
}

function pdfLiteral(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== "\\") { out += input[i]; continue; }
    const next = input[++i] || "";
    const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
    if (escapes[next]) out += escapes[next];
    else if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(input[i + 1] || "")) oct += input[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}

function pdfStrings(content: string): string[] {
  const found: string[] = [];
  const direct = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  Array.from(content.matchAll(direct)).forEach(match => found.push(pdfLiteral(match[1])));
  const arrays = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
  Array.from(content.matchAll(arrays)).forEach(match => {
    const partRe = /\(((?:\\.|[^\\)])*)\)/g;
    let part: RegExpExecArray | null;
    while ((part = partRe.exec(match[1])) !== null) found.push(pdfLiteral(part[1]));
  });
  return found.map(v => v.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function extractPdfStrings(buffer: Buffer): string[] {
  const source = buffer.toString("latin1");
  const contents: string[] = [source];
  let cursor = 0;
  while (true) {
    const streamAt = source.indexOf("stream", cursor);
    if (streamAt < 0) break;
    let start = streamAt + 6;
    if (source[start] === "\r") start++;
    if (source[start] === "\n") start++;
    const end = source.indexOf("endstream", start);
    if (end < 0) break;
    try { contents.push(inflateSync(new Uint8Array(buffer.subarray(start, end))).toString("latin1")); } catch { /* stream não comprimido ou imagem */ }
    cursor = end + 9;
  }
  return contents.flatMap(pdfStrings);
}

function parsePdfRows(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const tokens = extractPdfStrings(buffer);
  if (!tokens.length) return { headers: ["data", "descricao", "valor"], rows: [] };
  const dateRe = /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})(?:\s|$)/;
  const groups: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (dateRe.test(token) && current.length) { groups.push(current); current = []; }
    current.push(token);
  }
  if (current.length) groups.push(current);
  const rows = groups.map(group => {
    const joined = group.join(" ");
    const date = joined.match(dateRe)?.[1] || "";
    const candidates = joined.replace(date, " ").match(/-?\d[\d\s.,]{1,}/g) || [];
    const amount = candidates.length ? candidates[candidates.length - 1].replace(/\s/g, "") : "";
    const description = joined
      .replace(date, " ")
      .replace(amount, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { data: date, descricao: description, valor: amount };
  }).filter(row => row.data || row.descricao || row.valor).slice(0, MAX_ROWS);
  return { headers: ["data", "descricao", "valor"], rows };
}

async function parseWorkbook(buffer: Buffer, ext: string) {
  if (ext === "csv") {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/);
    const first = lines.find(line => line.trim()) || "";
    const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const matrix = parseCsv(delimiter === ";" ? text : text.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ";"));
    return rowsFromMatrix(matrix);
  }
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets.find(ws => ws.rowCount > 0);
  if (!sheet) return { headers: [], rows: [] };
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    matrix.push((row.values as Cell[]).slice(1).map(value => cellText(value as Cell)));
  });
  return rowsFromMatrix(matrix);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad(401, "Não autenticado");

  const form = await req.formData();
  const file = form.get("file");
  const targetType = String(form.get("targetType") || "transaction") as TargetType;
  if (!(file instanceof File)) return bad(400, "Ficheiro não recebido");
  if (!["transaction", "receivable", "payable"].includes(targetType)) return bad(400, "Tipo de importação inválido");
  if (file.size > MAX_BYTES) return bad(413, "O ficheiro excede o limite de 10 MB");

  const name = file.name.toLowerCase();
  const ext = name.endsWith(".xlsx") ? "xlsx" : name.endsWith(".csv") || name.endsWith(".tsv") ? "csv" : name.endsWith(".pdf") ? "pdf" : "";
  if (!ext) return bad(415, "Formato não suportado. Use .xlsx, .csv ou .pdf");

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const parsed = ext === "pdf" ? parsePdfRows(buffer) : await parseWorkbook(buffer, ext);
    if (!parsed.rows.length && ext === "pdf") {
      return bad(422, "Não foi encontrado texto no PDF. Este PDF pode ser digitalizado como imagem e precisa de OCR.");
    }
    if (!parsed.rows.length) return bad(422, "Não foram encontradas linhas de dados. Confirme se a primeira linha contém os cabeçalhos.");
    return Response.json({
      sourceFileName: file.name,
      sourceFormat: ext,
      targetType,
      headers: parsed.headers,
      rows: parsed.rows,
      truncated: parsed.rows.length >= MAX_ROWS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o ficheiro";
    return bad(422, "Não foi possível ler o ficheiro: " + message);
  }
}
