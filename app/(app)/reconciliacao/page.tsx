"use client";
import { ChangeEvent, useMemo, useState } from "react";
import { Check, FileUp, GitCompareArrows, RefreshCw, Undo2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { BankStatementDirection, fmtDate, fmtKz, JournalEntry } from "@/lib/data";

type ParsedLine = { accountId: string; transactionDate: string; amount: number; direction: BankStatementDirection; description: string; reference?: string; externalId?: string };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const parseCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ""; continue; }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
};
const parseMoney = (raw: string) => {
  let value = raw.replace(/[^0-9,.-]/g, "").trim();
  if (!value) return 0;
  if (value.includes(",") && value.includes(".")) {
    value = value.lastIndexOf(",") > value.lastIndexOf(".") ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (value.includes(",")) value = value.replace(",", ".");
  return Number(value) || 0;
};
const parseDate = (raw: string) => {
  const value = raw.trim().split(/[ T]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.split(/[./-]/);
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  return "";
};
const findColumn = (headers: string[], names: string[]) => headers.findIndex(h => names.includes(h));

function parseBankCsv(text: string, accountId: string): ParsedLine[] {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (!rawLines.length) return [];
  const first = rawLines[0];
  const delimiter = [",", ";", "\t"].sort((a, b) => parseCsvLine(first, b).length - parseCsvLine(first, a).length)[0];
  const records = rawLines.map(line => parseCsvLine(line, delimiter));
  const headers = records[0].map(normalize);
  const isHeader = headers.some(h => ["data", "date", "valor", "amount", "debito", "credito", "descricao", "description"].includes(h));
  const indexes = isHeader ? {
    date: findColumn(headers, ["data", "date", "data movimento", "movement date"]),
    description: findColumn(headers, ["descricao", "description", "descritivo", "memo"]),
    amount: findColumn(headers, ["valor", "amount", "montante", "quantia"]),
    debit: findColumn(headers, ["debito", "debit", "saida", "outflow"]),
    credit: findColumn(headers, ["credito", "credit", "entrada", "inflow"]),
    direction: findColumn(headers, ["tipo", "type", "direction", "movimento"]),
    reference: findColumn(headers, ["referencia", "reference", "documento", "document"]),
    external: findColumn(headers, ["id", "id transacao", "transaction id", "external id"]),
  } : { date: 0, description: 1, amount: 2, debit: -1, credit: -1, direction: 3, reference: 4, external: -1 };
  const rows = isHeader ? records.slice(1) : records;
  const get = (row: string[], index: number) => index >= 0 ? (row[index] || "").trim() : "";
  return rows.map(row => {
    const transactionDate = parseDate(get(row, indexes.date));
    const debit = parseMoney(get(row, indexes.debit));
    const credit = parseMoney(get(row, indexes.credit));
    const rawAmount = parseMoney(get(row, indexes.amount));
    const type = normalize(get(row, indexes.direction));
    let direction: BankStatementDirection = type.includes("deb") || type.includes("said") || type === "d" ? "outgoing" : "incoming";
    let amount = rawAmount;
    if (debit > 0) { amount = debit; direction = "outgoing"; }
    else if (credit > 0) { amount = credit; direction = "incoming"; }
    else if (rawAmount < 0) { amount = Math.abs(rawAmount); direction = "outgoing"; }
    return {
      accountId, transactionDate, amount: Math.round(amount * 100) / 100, direction,
      description: get(row, indexes.description) || "Movimento bancário",
      reference: get(row, indexes.reference) || undefined,
      externalId: get(row, indexes.external) || get(row, indexes.reference) || undefined,
    };
  }).filter(row => row.transactionDate && row.amount > 0);
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.01;
const daysBetween = (a: string, b: string) => Math.abs(new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000;
const lineMatchesEntry = (line: ParsedLine | { accountId: string; transactionDate: string; amount: number; direction: BankStatementDirection }, entry: JournalEntry) =>
  entry.status === "posted" && daysBetween(line.transactionDate, entry.transactionDate) <= 30 && entry.lines.some(l => l.accountId === line.accountId && sameAmount(l.amount, line.amount) && ((line.direction === "incoming" && l.direction === "debit") || (line.direction === "outgoing" && l.direction === "credit")));

export default function ReconciliacaoPage() {
  const {
    accounts, journalEntries, bankStatementLines, importBankStatementLines,
    matchBankStatementLine, unmatchBankStatementLine, ignoreBankStatementLine,
    refreshBankStatementLines,
  } = useStore();
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<ParsedLine[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState("");

  const visibleLines = useMemo(() => bankStatementLines.filter(line => !accountId || line.accountId === accountId), [bankStatementLines, accountId]);
  const unmatched = visibleLines.filter(line => line.status === "unmatched").length;
  const matched = visibleLines.filter(line => line.status === "matched").length;
  const candidatesFor = (line: { accountId: string; transactionDate: string; amount: number; direction: BankStatementDirection }) => journalEntries.filter(entry => lineMatchesEntry(line, entry));

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError(""); setPreview([]);
    if (!file || !accountId) { setFileError("Escolhe primeiro a conta a que pertence o extrato."); return; }
    const parsed = parseBankCsv(await file.text(), accountId);
    if (!parsed.length) setFileError("Não encontrei linhas válidas. Usa CSV com data e valor.");
    setPreview(parsed);
    event.target.value = "";
  };

  const importPreview = async () => {
    setLoading(true);
    const error = await importBankStatementLines(preview);
    setLoading(false);
    if (!error) setPreview([]);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div><div className="flex items-center gap-2 text-maka-400 text-sm font-semibold"><GitCompareArrows size={17} /> Controlo bancário</div><h1 className="font-display text-2xl md:text-3xl tracking-tight mt-1">Reconciliação</h1><p className="text-sm text-ink-400 mt-1">Importa o extrato e confirma quais movimentos já estão no diário.</p></div>
        <button className="btn-ghost" onClick={() => refreshBankStatementLines()}><RefreshCw size={15} /> Atualizar</button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Linhas visíveis</div><div className="font-display text-2xl mt-1">{visibleLines.length}</div></div><div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Por confirmar</div><div className="font-display text-2xl mt-1 text-amber-400">{unmatched}</div></div><div className="card p-4"><div className="text-[11px] uppercase tracking-wider text-ink-500 font-bold">Reconciliadas</div><div className="font-display text-2xl mt-1 text-emerald-400">{matched}</div></div></div>

      <section className="card p-5 space-y-4"><div className="flex items-center gap-2 font-semibold"><FileUp size={16} className="text-maka-400" /> Importar extrato CSV</div><div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end"><div><label className="label">Conta bancária</label><select className="input" value={accountId} onChange={e => { setAccountId(e.target.value); setPreview([]); }}><option value="">Escolhe a conta…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><label className={`btn-primary cursor-pointer ${!accountId ? "opacity-50 pointer-events-none" : ""}`}><FileUp size={15} /> Escolher CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} /></label></div><p className="text-[11px] text-ink-500">Aceita CSV com data, descrição e valor. Também reconhece colunas separadas de débito e crédito, vírgula, ponto e vírgula ou tabulação.</p>{fileError && <p className="text-sm text-red-400">{fileError}</p>}
        {preview.length > 0 && <div className="rounded-lg border border-maka-500/30 bg-maka-500/5 p-3"><div className="flex items-center justify-between gap-3"><div className="text-sm">Pré-visualização: <span className="font-semibold">{preview.length} linhas válidas</span></div><button className="btn-primary text-xs" onClick={importPreview} disabled={loading}>{loading ? "A importar…" : "Importar linhas"}</button></div><div className="mt-3 space-y-1 text-xs text-ink-400">{preview.slice(0, 5).map((line, index) => <div key={`${line.transactionDate}-${index}`} className="flex justify-between gap-3"><span>{fmtDate(line.transactionDate)} · {line.description}</span><span className={line.direction === "incoming" ? "text-emerald-400" : "text-red-400"}>{line.direction === "incoming" ? "+" : "−"}{fmtKz(line.amount)}</span></div>)}{preview.length > 5 && <div>… e mais {preview.length - 5} linhas</div>}</div></div>}
      </section>

      <section className="card overflow-hidden"><div className="p-5 border-b border-ink-800"><h2 className="font-semibold">Linhas para revisão</h2><p className="text-xs text-ink-500 mt-1">O sistema sugere lançamentos pela conta, valor, direção e uma janela de 30 dias.</p></div>{visibleLines.length === 0 ? <div className="p-10 text-center text-sm text-ink-500">Ainda não há linhas importadas para esta conta.</div> : <div className="divide-y divide-ink-800">{visibleLines.map(line => { const candidates = candidatesFor(line); const selected = selectedMatches[line.id] || ""; const matchedEntry = line.matchedJournalEntryId ? journalEntries.find(e => e.id === line.matchedJournalEntryId) : undefined; return <div key={line.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3"><div className="min-w-0 lg:w-[31%]"><div className="font-medium truncate">{line.description || "Movimento bancário"}</div><div className="text-xs text-ink-500 mt-1">{fmtDate(line.transactionDate)}{line.reference ? ` · Ref. ${line.reference}` : ""}</div></div><div className={`font-display text-lg lg:w-[13%] ${line.direction === "incoming" ? "text-emerald-400" : "text-red-400"}`}>{line.direction === "incoming" ? "+" : "−"}{fmtKz(line.amount)}</div><div className="lg:flex-1">{line.status === "matched" ? <div className="text-xs text-emerald-400 flex items-center gap-1"><Check size={14} /> {matchedEntry?.description || "Lançamento confirmado"}</div> : line.status === "ignored" ? <div className="text-xs text-ink-500 flex items-center gap-1"><X size={14} /> Ignorada</div> : candidates.length > 0 ? <select className="input text-xs" value={selected} onChange={e => setSelectedMatches(prev => ({ ...prev, [line.id]: e.target.value }))}><option value="">Escolhe um lançamento sugerido…</option>{candidates.map(entry => <option key={entry.id} value={entry.id}>{fmtDate(entry.transactionDate)} · {entry.description} · {fmtKz(line.amount)}</option>)}</select> : <span className="text-xs text-ink-500">Nenhum lançamento coincidente encontrado</span>}</div><div className="flex gap-2 lg:w-auto">{line.status === "unmatched" && <><button className="btn-primary text-xs" disabled={!selected} onClick={() => matchBankStatementLine(line.id, selected)}><Check size={13} /> Confirmar</button><button className="btn-ghost text-xs" onClick={() => ignoreBankStatementLine(line.id)}><X size={13} /> Ignorar</button></>}{line.status === "matched" && <button className="btn-ghost text-xs" onClick={() => unmatchBankStatementLine(line.id)}><Undo2 size={13} /> Desfazer</button>}</div></div>; })}</div>}</section>
    </div>
  );
}