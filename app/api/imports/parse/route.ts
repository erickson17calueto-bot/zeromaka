export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Workbook } from "exceljs";
import { inflateRawSync, inflateSync } from "node:zlib";
import { createClient } from "@/lib/supabase/server";
import { encontrarLinhaCabecalho } from "@/lib/imports/header-row";
import { decodeCsvBuffer, parseCsv } from "@/lib/imports/csv";

type TargetType = "transaction" | "receivable" | "payable" | "contacts";
type Cell = string | number | boolean | Date | null | undefined;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;
// O tamanho comprimido do .xlsx não chega para proteger a função: um ZIP
// malformado pode expandir centenas de MB e prender o worker antes de a
// interface receber a revisão. Fazemos um preflight leve antes do ExcelJS.
const MAX_XLSX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 4000;
const MAX_PDF_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

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

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number };

function zipEntries(buffer: Buffer): ZipEntry[] {
  // EOCD fica nos últimos 65.535 bytes de um ZIP normal. Se não existir,
  // deixamos o ExcelJS produzir a mensagem de ficheiro inválido no caminho
  // normal, mas não tentamos percorrer bytes arbitrariamente.
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const start = Math.max(0, buffer.length - 65_557);
  const eocd = buffer.lastIndexOf(signature, buffer.length - 22);
  if (eocd < start) return [];
  const count = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (count > MAX_XLSX_ENTRIES || directoryOffset + directorySize > buffer.length) {
    throw new Error("Livro Excel demasiado complexo ou inválido");
  }
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xlsxZipPreflight(buffer: Buffer): ZipEntry[] {
  const entries = zipEntries(buffer);
  const expanded = entries.reduce((total, entry) => total + entry.uncompressedSize, 0);
  if (expanded > MAX_XLSX_UNCOMPRESSED_BYTES) {
    throw new Error("Livro Excel demasiado grande depois de descomprimido; exporta apenas a folha necessária");
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): string {
  if (entry.uncompressedSize > MAX_XLSX_UNCOMPRESSED_BYTES || entry.localOffset + 30 > buffer.length) {
    throw new Error("Entrada Excel demasiado grande ou inválida");
  }
  const local = entry.localOffset;
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Livro Excel inválido");
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) throw new Error("Livro Excel truncado");
  const compressed = buffer.subarray(start, end);
  if (entry.method === 0) return compressed.toString("utf8");
  if (entry.method === 8) return inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_UNCOMPRESSED_BYTES }).toString("utf8");
  throw new Error("Compressão Excel não suportada");
}

function xmlUnescape(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function listXlsxSheets(buffer: Buffer): string[] {
  const entries = xlsxZipPreflight(buffer);
  const workbookEntry = entries.find(entry => entry.name === "xl/workbook.xml");
  if (!workbookEntry) return [];
  const xml = readZipEntry(buffer, workbookEntry);
  const names: string[] = [];
  const sheetRe = /<sheet\b[^>]*\bname=(['"])([\s\S]*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = sheetRe.exec(xml))) names.push(xmlUnescape(match[2]));
  return names;
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

type PdfLiteralSpan = { value: string; end: number };
type PdfHexSpan = { value: string; end: number };

function readPdfLiteral(content: string, open: number): PdfLiteralSpan | null {
  let depth = 1;
  let escaped = false;
  for (let i = open + 1; i < content.length; i++) {
    const ch = content[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === "(") { depth++; continue; }
    if (ch === ")") {
      depth--;
      if (depth === 0) return { value: content.slice(open + 1, i), end: i };
    }
  }
  return null;
}

function readPdfHex(content: string, open: number): PdfHexSpan | null {
  const end = content.indexOf(">", open + 1);
  if (end < 0) return null;
  return { value: content.slice(open + 1, end), end };
}

function decodePdfHex(input: string, unicodeMap: Map<string, string>): string {
  const clean = input.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i < clean.length; i += 4) {
    const code = clean.slice(i, i + 4).padEnd(4, "0").toUpperCase();
    const numeric = Number.parseInt(code, 16);
    if (!Number.isFinite(numeric)) continue;
    out += unicodeMap.get(code) || String.fromCharCode(numeric);
  }
  return out;
}

function pdfUnicodeMap(contents: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const pairRe = /<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]{4})>/g;
  for (const content of contents) {
    let pair: RegExpExecArray | null;
    while ((pair = pairRe.exec(content))) {
      map.set(pair[1].toUpperCase(), String.fromCharCode(Number.parseInt(pair[2], 16)));
    }
  }
  return map;
}

function skipPdfWhitespace(content: string, start: number, end = content.length): number {
  let i = start;
  while (i < end && /\s/.test(content[i])) i++;
  return i;
}

function pdfStrings(content: string, unicodeMap: Map<string, string>): string[] {
  const found: string[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === "(") {
      const literal = readPdfLiteral(content, i);
      if (!literal) { i++; continue; }
      const operator = skipPdfWhitespace(content, literal.end + 1);
      if (content.slice(operator, operator + 2) === "Tj") found.push(pdfLiteral(literal.value));
      i = literal.end + 1;
      continue;
    }
    if (content[i] === "<" && content[i + 1] !== "<") {
      const hex = readPdfHex(content, i);
      if (!hex) { i++; continue; }
      const operator = skipPdfWhitespace(content, hex.end + 1);
      if (content.slice(operator, operator + 2) === "Tj") found.push(decodePdfHex(hex.value, unicodeMap));
      i = hex.end + 1;
      continue;
    }
    if (content[i] === "[") {
      const arrayStart = i + 1;
      let cursor = arrayStart;
      let nesting = 0;
      let arrayEnd = -1;
      while (cursor < content.length) {
        if (content[cursor] === "(") {
          const literal = readPdfLiteral(content, cursor);
          if (!literal) { cursor++; continue; }
          cursor = literal.end + 1;
          continue;
        }
        if (content[cursor] === "<" && content[cursor + 1] !== "<") {
          const hex = readPdfHex(content, cursor);
          if (!hex) { cursor++; continue; }
          cursor = hex.end + 1;
          continue;
        }
        if (content[cursor] === "[") { nesting++; cursor++; continue; }
        if (content[cursor] === "]") {
          if (nesting === 0) { arrayEnd = cursor; break; }
          nesting--;
        }
        cursor++;
      }
      if (arrayEnd >= 0) {
        const operator = skipPdfWhitespace(content, arrayEnd + 1);
        if (content.slice(operator, operator + 2) === "TJ") {
          let part = arrayStart;
          let text = "";
          while (part < arrayEnd) {
            if (content[part] === "(") {
              const literal = readPdfLiteral(content, part);
              if (!literal) { part++; continue; }
              text += pdfLiteral(literal.value);
              part = literal.end + 1;
            } else if (content[part] === "<" && content[part + 1] !== "<") {
              const hex = readPdfHex(content, part);
              if (!hex) { part++; continue; }
              text += decodePdfHex(hex.value, unicodeMap);
              part = hex.end + 1;
            } else part++;
          }
          if (text) found.push(text);
        }
        i = arrayEnd + 1;
        continue;
      }
    }
    i++;
  }
  return found.map(v => v.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function extractPdfStrings(buffer: Buffer): string[] {
  const source = buffer.toString("latin1");
  const contents: string[] = [source];
  let expanded = 0;
  let cursor = 0;
  while (true) {
    const streamAt = source.indexOf("stream", cursor);
    if (streamAt < 0) break;
    let start = streamAt + 6;
    if (source[start] === "\r") start++;
    if (source[start] === "\n") start++;
    const end = source.indexOf("endstream", start);
    if (end < 0) break;
    try {
      const inflated = inflateSync(new Uint8Array(buffer.subarray(start, end)), { maxOutputLength: MAX_PDF_UNCOMPRESSED_BYTES });
      expanded += inflated.length;
      if (expanded > MAX_PDF_UNCOMPRESSED_BYTES) throw new Error("PDF demasiado grande depois de descomprimido");
      contents.push(inflated.toString("latin1"));
    } catch (error) {
      if (error instanceof Error && error.message.includes("PDF demasiado")) throw error;
      const raw = buffer.subarray(start, end).toString("latin1");
      if (/begincmap|\bBT\b|\bTJ\b/.test(raw)) contents.push(raw);
    }
    cursor = end + 9;
  }
  const unicodeMap = pdfUnicodeMap(contents);
  return contents.flatMap(content => pdfStrings(content, unicodeMap));
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
  const entries = xlsxZipPreflight(buffer);
  if (!entries.length) throw new Error("Livro Excel inválido ou sem estrutura ZIP");
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
  return listXlsxSheets(buffer);
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
  if (!["transaction", "receivable", "payable", "contacts"].includes(targetType)) return bad(400, "Tipo de importação inválido");
  if (file.size > MAX_BYTES) return bad(413, "O ficheiro excede o limite de 10 MB");

  const name = file.name.toLowerCase();
  const ext = name.endsWith(".xlsx") ? "xlsx" : name.endsWith(".csv") || name.endsWith(".tsv") ? "csv" : name.endsWith(".pdf") ? "pdf" : "";
  if (!ext) return bad(415, "Formato não suportado. Use .xlsx, .csv ou .pdf");
  if (targetType === "contacts" && ext === "pdf") return bad(415, "Para contactos, usa um ficheiro .xlsx ou .csv");

  const buffer = Buffer.from(await file.arrayBuffer());
  const startedAt = Date.now();
  console.info("[imports/parse] start", { bytes: file.size, ext, targetType, inspectOnly });

  if (inspectOnly) {
    // Só faz sentido em Excel: CSV e PDF não têm folhas.
    if (ext !== "xlsx") return Response.json({ sheets: [] });
    try {
      const sheets = await listSheets(buffer);
      console.info("[imports/parse] inspect complete", { ext, sheets: sheets.length, ms: Date.now() - startedAt });
      return Response.json({ sheets });
    } catch (error) {
      // Falhar aqui não é fatal: o utilizador segue sem seletor e a leitura
      // normal a seguir dá a mensagem de erro adequada.
      console.warn("[imports/parse] inspect failed", { ext, ms: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
      return Response.json({ sheets: [] });
    }
  }

  try {
    const parsed = ext === "pdf"
      ? { ...parsePdfRows(buffer), sheetName: null, sheets: [] as string[] }
      : await parseWorkbook(buffer, ext, sheetName);
    console.info("[imports/parse] parsed", { ext, rows: parsed.rows.length, ms: Date.now() - startedAt });
    if (!parsed.rows.length && ext === "pdf") {
      console.warn("[imports/parse] pdf has no text", { bytes: file.size, ms: Date.now() - startedAt });
      return bad(422, "Não foi encontrado texto no PDF. Este PDF pode ser digitalizado como imagem e precisa de OCR.");
    }
    if (!parsed.rows.length) {
      return bad(422, parsed.sheetName
        ? `A folha "${parsed.sheetName}" não tem linhas de dados. Escolhe outra folha ou confirma que existe uma linha de cabeçalhos.`
        : "Não foram encontradas linhas de dados. Confirme se a primeira linha contém os cabeçalhos.");
    }
    console.info("[imports/parse] complete", { ext, targetType, rows: parsed.rows.length, ms: Date.now() - startedAt });
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
    console.warn("[imports/parse] failed", { ext, targetType, ms: Date.now() - startedAt, error: message });
    return bad(422, "Não foi possível ler o ficheiro: " + message);
  }
}
