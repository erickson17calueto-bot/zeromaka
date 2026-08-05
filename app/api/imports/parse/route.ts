export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Workbook } from "exceljs";
import { inflateSync } from "node:zlib";
import { createClient } from "@/lib/supabase/server";
import { encontrarLinhaCabecalho } from "@/lib/imports/header-row";

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

const WINDOWS_1252_EXTRA: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…",
  0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8A: "Š",
  0x8B: "‹", 0x8C: "Œ", 0x8E: "Ž", 0x91: "‘", 0x92: "’",
  0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9A: "š", 0x9B: "›", 0x9C: "œ",
  0x9E: "ž", 0x9F: "Ÿ",
};

function decodeWindows1252(buffer: Buffer): string {
  let out = "";
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    out += WINDOWS_1252_EXTRA[byte] ?? String.fromCharCode(byte);
  }
  return out;
}

// Exportações contabilísticas angolanas costumam vir em Windows-1252/Latin-1, não UTF-8;
// decodificar sempre como UTF-8 corrompe cabeçalhos acentuados (ex: "DESCRIÇÃO", "SAÍDA").
function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;
  return decodeWindows1252(buffer);
}

function parseCsv(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '"' && quoted && next === '"') { field += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === delimiter) { row.push(field.trim()); field = ""; continue; }
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
  // Nem sempre a tabela começa na primeira linha: há folhas que abrem com um
  // título ou uma linha de totais antes do cabeçalho.
  const inicio = encontrarLinhaCabecalho(matrix);
  const headers = matrix[inicio].map((h, i) => h || "coluna_" + (i + 1));
  const rows = matrix.slice(inicio + 1).filter(row => row.some(Boolean)).slice(0, MAX_ROWS).map(row => {
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

type ParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  sheetName: string | null;
  sheets: string[];
};

/**
 * Lê o ficheiro. Em livros Excel com várias folhas, `sheetName` escolhe qual —
 * sem ele fica a primeira com dados, e `sheets` traz sempre a lista completa
 * para o utilizador poder trocar.
 */
async function parseWorkbook(buffer: Buffer, ext: string, sheetName?: string): Promise<ParseResult> {
  if (ext === "csv") {
    const text = decodeCsvBuffer(buffer).replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/);
    const first = lines.find(line => line.trim()) || "";
    const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const matrix = parseCsv(text, delimiter);
    return { ...rowsFromMatrix(matrix), sheetName: null, sheets: [] };
  }
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as any);
  // Um livro de contabilidade real traz várias folhas ("DIARIO CAIXA",
  // "EXTRATO BAI", "APORTE"), cada uma com movimentos diferentes. Ler sempre a
  // primeira devolvia ao utilizador uma folha que ele não tinha pedido.
  const comDados = workbook.worksheets.filter(ws => ws.rowCount > 0);
  const sheets = comDados.map(ws => ws.name);
  const sheet = (sheetName && comDados.find(ws => ws.name === sheetName)) || comDados[0];
  if (!sheet) return { headers: [], rows: [], sheetName: null, sheets };
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    matrix.push((row.values as Cell[]).slice(1).map(value => cellText(value as Cell)));
  });
  // O nome da folha costuma dizer a que conta o extrato pertence
  // ("Caixa", "BAI", "Unitel Money") — é a melhor pista que temos num
  // ficheiro que não traz coluna de conta.
  return { ...rowsFromMatrix(matrix), sheetName: sheet.name, sheets };
}

/** Só os nomes das folhas com dados, para o seletor antes de ler o ficheiro. */
async function listSheets(buffer: Buffer): Promise<string[]> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook.worksheets.filter(ws => ws.rowCount > 0).map(ws => ws.name);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad(401, "Não autenticado");

  const form = await req.formData();
  const file = form.get("file");
  const targetType = String(form.get("targetType") || "transaction") as TargetType;
  // Folha escolhida pelo utilizador num livro com várias; vazio = a primeira.
  const sheetName = String(form.get("sheetName") || "") || undefined;
  // "inspect" só devolve os nomes das folhas, para montar o seletor antes de ler.
  const inspectOnly = String(form.get("mode") || "") === "inspect";
  if (!(file instanceof File)) return bad(400, "Ficheiro não recebido");
  if (!["transaction", "receivable", "payable"].includes(targetType)) return bad(400, "Tipo de importação inválido");
  if (file.size > MAX_BYTES) return bad(413, "O ficheiro excede o limite de 10 MB");

  const name = file.name.toLowerCase();
  const ext = name.endsWith(".xlsx") ? "xlsx" : name.endsWith(".csv") || name.endsWith(".tsv") ? "csv" : name.endsWith(".pdf") ? "pdf" : "";
  if (!ext) return bad(415, "Formato não suportado. Use .xlsx, .csv ou .pdf");

  const buffer = Buffer.from(await file.arrayBuffer());

  if (inspectOnly) {
    // Só faz sentido em Excel: CSV e PDF não têm folhas.
    if (ext !== "xlsx") return Response.json({ sheets: [] });
    try {
      return Response.json({ sheets: await listSheets(buffer) });
    } catch {
      // Falhar aqui não é fatal: o utilizador segue sem seletor e a leitura
      // normal a seguir dá a mensagem de erro adequada.
      return Response.json({ sheets: [] });
    }
  }

  try {
    const parsed = ext === "pdf"
      ? { ...parsePdfRows(buffer), sheetName: null, sheets: [] as string[] }
      : await parseWorkbook(buffer, ext, sheetName);
    if (!parsed.rows.length && ext === "pdf") {
      return bad(422, "Não foi encontrado texto no PDF. Este PDF pode ser digitalizado como imagem e precisa de OCR.");
    }
    if (!parsed.rows.length) {
      return bad(422, parsed.sheetName
        ? `A folha "${parsed.sheetName}" não tem linhas de dados. Escolhe outra folha ou confirma que existe uma linha de cabeçalhos.`
        : "Não foram encontradas linhas de dados. Confirme se a primeira linha contém os cabeçalhos.");
    }
    return Response.json({
      sourceFileName: file.name,
      sourceFormat: ext,
      targetType,
      headers: parsed.headers,
      rows: parsed.rows,
      sheetName: parsed.sheetName,
      sheets: parsed.sheets,
      truncated: parsed.rows.length >= MAX_ROWS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o ficheiro";
    return bad(422, "Não foi possível ler o ficheiro: " + message);
  }
}
