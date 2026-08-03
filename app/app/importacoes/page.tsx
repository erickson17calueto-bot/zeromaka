"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, FileSpreadsheet, FileText, Loader2, RotateCcw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { fmtDate, fmtKz, Account, Contact, FinancialCategory, JournalEntry, Obligation } from "@/lib/data";

type TargetType = "transaction" | "receivable" | "payable";
type Decision = "pending" | "keep" | "discard";
type ImportRow = {
  id: string;
  row_number: number;
  raw_data: Record<string, string>;
  normalized_data: NormalizedRow;
  duplicate_key: string | null;
  validation_status: "ready" | "error" | "applied" | "discarded";
  decision: Decision;
  error_message?: string | null;
  applied_record_id?: string | null;
};
type ImportBatch = {
  id: string;
  source_file_name: string;
  source_format: "xlsx" | "csv" | "pdf";
  target_type: TargetType;
  status: string;
  total_rows: number;
  created_at: string;
};

type NormalizedRow = {
  date?: string;
  issue_date?: string;
  due_date?: string;
  amount?: number;
  description?: string;
  direction?: "income" | "expense";
  account_id?: string;
  account_name?: string;
  category_id?: string;
  category_name?: string;
  contact_id?: string;
  contact_name?: string;
  external_document_number?: string;
  document_kind?: string;
  is_sale?: boolean;
  duplicate?: boolean;
  duplicate_reason?: string;
};

const TARGET_LABEL: Record<TargetType, string> = {
  transaction: "transações",
  receivable: "faturas de clientes",
  payable: "faturas de fornecedores",
};

const aliases = {
  date: ["data", "date", "data do lançamento", "data movimento", "transaction_date"],
  issue: ["emissão", "emissao", "data emissão", "data emissao", "issue_date", "data fatura"],
  due: ["vencimento", "data vencimento", "due_date", "data de vencimento"],
  amount: ["valor", "amount", "montante", "total", "valor total", "debito", "débito", "credito", "crédito"],
  credit: ["entrada", "credito", "crédito", "receita", "haver"],
  debit: ["saida", "saída", "debito", "débito", "despesa", "deve"],
  description: ["descrição", "descricao", "description", "histórico", "historico", "detalhe", "movimento"],
  account: ["conta", "account", "conta bancária", "conta bancaria", "carteira"],
  category: ["categoria", "category", "classe"],
  contact: ["cliente", "fornecedor", "contacto", "contato", "contact", "entidade", "nome"],
  type: ["tipo", "type", "natureza", "entrada/saída", "entrada/saida", "direção", "direcao"],
  document: ["nº documento", "nº doc", "numero documento", "número documento", "documento", "invoice", "fatura", "referência", "referencia"],
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function keyOf(value: unknown): string {
  return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function getField(raw: Record<string, string>, names: string[]): string {
  const entries = Object.entries(raw);
  const found = entries.find(([key]) => names.some(name => keyOf(key) === keyOf(name)));
  return found ? clean(found[1]) : "";
}

function parseAmount(value: string): number {
  let text = clean(value).replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  const negative = text.startsWith("-") || (clean(value).startsWith("(") && clean(value).endsWith(")"));
  text = text.replace(/-/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = text.length - comma - 1;
    text = decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, "");
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.abs(negative ? -amount : amount) : 0;
}

function parseDate(value: string): string {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split(/[-/]/);
    return y + "-" + m.padStart(2, "0") + "-" + d.padStart(2, "0");
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(text)) {
    const [d, m, y0] = text.split(/[-/]/);
    const y = y0.length === 2 ? "20" + y0 : y0;
    return y + "-" + m.padStart(2, "0") + "-" + d.padStart(2, "0");
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 70000) {
    const date = new Date(Date.UTC(1899, 11, 30 + serial));
    return date.toISOString().slice(0, 10);
  }
  return "";
}

function dateOk(value?: string): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function findAccount(accounts: Account[], name: string): Account | undefined {
  const wanted = keyOf(name);
  return accounts.find(a => keyOf(a.name) === wanted);
}

function findContact(contacts: Contact[], name: string): Contact | undefined {
  const wanted = keyOf(name);
  return contacts.find(c => keyOf(c.name) === wanted);
}

function findCategory(categories: FinancialCategory[], name: string, target: TargetType): FinancialCategory | undefined {
  const wanted = keyOf(name);
  const type = target === "transaction" ? undefined : target === "receivable" ? "income" : "expense";
  return categories.find(c => keyOf(c.name) === wanted && (!type || c.categoryType === type));
}

function existingKeys(target: TargetType, entries: JournalEntry[], obligations: Obligation[]): Set<string> {
  if (target === "transaction") {
    return new Set(entries.map(e => "transaction|" + e.transactionDate + "|" + e.lines[0]?.amount + "|" + keyOf(e.description)));
  }
  return new Set(obligations.filter(o => o.direction === (target === "receivable" ? "receivable" : "payable"))
    .map(o => target + "|" + o.issueDate + "|" + o.originalAmount + "|" + o.contactId + "|" + keyOf(o.externalDocumentNumber || o.description)));
}

function normalizedKey(target: TargetType, data: NormalizedRow): string {
  return target === "transaction"
    ? "transaction|" + (data.date || "") + "|" + Number(data.amount || 0) + "|" + keyOf(data.description)
    : target + "|" + (data.issue_date || "") + "|" + Number(data.amount || 0) + "|" + (data.contact_id || keyOf(data.contact_name)) + "|" + keyOf(data.external_document_number || data.description);
}

function normalizeRow(raw: Record<string, string>, target: TargetType, accounts: Account[], contacts: Contact[], categories: FinancialCategory[], existing: Set<string>): { data: NormalizedRow; key: string; error?: string } {
  // Alguns extratos (ex: diário de caixa) não têm uma coluna "valor" única,
  // usam colunas separadas de entrada (crédito) e saída (débito).
  const singleAmountField = getField(raw, aliases.amount);
  const creditField = getField(raw, aliases.credit);
  const debitField = getField(raw, aliases.debit);
  const creditAmount = parseAmount(creditField);
  const debitAmount = parseAmount(debitField);
  const hasSplitColumns = !singleAmountField && (creditField || debitField);
  // Se entrada e saída vierem ambas preenchidas na mesma linha, a direção é
  // ambígua (normalmente erro de preenchimento na folha de origem) — não adivinhar.
  const splitAmbiguous = hasSplitColumns && creditAmount > 0 && debitAmount > 0;
  const amount = hasSplitColumns
    ? (splitAmbiguous ? 0 : (creditAmount || debitAmount))
    : parseAmount(singleAmountField);
  const description = getField(raw, aliases.description) || "Importação de ficheiro";
  const accountName = getField(raw, aliases.account);
  const categoryName = getField(raw, aliases.category);
  const contactName = getField(raw, aliases.contact);
  const account = findAccount(accounts, accountName);
  const contact = findContact(contacts, contactName);
  const category = findCategory(categories, categoryName, target);
  const directionText = keyOf(getField(raw, aliases.type));
  const direction = hasSplitColumns
    ? (creditAmount > 0 ? "income" : "expense")
    : directionText.includes("entrada") || directionText.includes("receita") || directionText.includes("income") || directionText.includes("credito") || directionText.includes("receb") || (!directionText && !clean(singleAmountField).startsWith("-")) ? "income" : "expense";
  const date = parseDate(getField(raw, aliases.date));
  const issueDate = parseDate(getField(raw, aliases.issue)) || date;
  const dueDate = parseDate(getField(raw, aliases.due)) || issueDate;
  const externalNumber = getField(raw, aliases.document);
  const data: NormalizedRow = target === "transaction"
    ? { date, amount, description, direction, account_id: account?.id, account_name: accountName, category_id: category?.id, category_name: categoryName, contact_id: contact?.id, contact_name: contactName }
    : { issue_date: issueDate, due_date: dueDate, amount, description, contact_id: contact?.id, contact_name: contactName, category_id: category?.id, category_name: categoryName, external_document_number: externalNumber, document_kind: target === "receivable" ? "invoice_reference" : "supplier_invoice", is_sale: target === "receivable" };
  const key = normalizedKey(target, data);

  const duplicate = existing.has(key);
  data.duplicate = duplicate;
  data.duplicate_reason = duplicate ? "Já existe um lançamento semelhante no ZeroMaka ou nesta importação." : undefined;
  let error = splitAmbiguous
    ? "Entrada e saída preenchidas na mesma linha; confirma manualmente o valor e o sentido"
    : amount <= 0 ? "Valor inválido ou não encontrado" : undefined;
  if (!error && target === "transaction" && !dateOk(date)) error = "Data do lançamento não reconhecida";
  if (!error && target === "transaction" && !account) error = "Conta não encontrada; escolhe uma conta";
  if (!error && target !== "transaction" && !dateOk(issueDate)) error = "Data de emissão não reconhecida";
  if (!error && target !== "transaction" && !contact) error = "Contacto não encontrado; escolhe um contacto";
  if (!error && target !== "transaction" && (!dateOk(dueDate) || dueDate < issueDate)) error = "Vencimento inválido";
  return { data, key, error };
}

export default function ImportacoesPage() {
  const router = useRouter();
  const supabase = createClient();
  const { orgId, accounts, contacts, categories, journalEntries, obligations } = useStore();
  const [target, setTarget] = useState<TargetType>("transaction");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [filter, setFilter] = useState<"all" | "ready" | "duplicate" | "error" | "discarded">("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadBatches = async () => {
    if (!orgId) return;
    const { data } = await supabase.from("import_batches").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20);
    if (data) setBatches(data as ImportBatch[]);
  };

  useEffect(() => { void loadBatches(); }, [orgId]);

  const loadRows = async (selected: ImportBatch) => {
    setBusy(true); setMessage("");
    const { data, error } = await supabase.from("import_rows").select("*").eq("batch_id", selected.id).order("row_number");
    if (error) setMessage(error.message);
    else { setBatch(selected); setTarget(selected.target_type); setRows((data || []) as ImportRow[]); }
    setBusy(false);
  };

  const createImport = async () => {
    if (!file || !orgId) return;
    setBusy(true); setMessage("");
    const form = new FormData();
    form.append("file", file);
    form.append("targetType", target);
    const response = await fetch("/api/imports/parse", { method: "POST", body: form });
    const parsed = await response.json();
    if (!response.ok) { setMessage(parsed.error || "Não foi possível ler o ficheiro"); setBusy(false); return; }
    const rawRows = parsed.rows as Record<string, string>[];
    const existing = existingKeys(target, journalEntries, obligations);
    const seen = new Set(existing);
    const prepared = rawRows.map((raw, i) => {
      const normalized = normalizeRow(raw, target, accounts, contacts, categories, seen);
      seen.add(normalized.key);
      return {
        organization_id: orgId, row_number: i + 1, raw_data: raw, normalized_data: normalized.data,
        duplicate_key: normalized.data.duplicate ? normalized.key : null,
        validation_status: normalized.error ? "error" : "ready",
        decision: "pending", error_message: normalized.error || null,
      };
    });
    const { data: userData } = await supabase.auth.getUser();
    const { data: newBatch, error: batchError } = await supabase.from("import_batches").insert({
      organization_id: orgId, source_file_name: parsed.sourceFileName, source_format: parsed.sourceFormat,
      target_type: target, total_rows: prepared.length, created_by: userData.user?.id,
    }).select("*").single();
    if (batchError || !newBatch) { setMessage(batchError?.message || "Não foi possível criar a importação"); setBusy(false); return; }
    // As linhas são preparadas antes de o lote existir, por isso só agora se
    // lhes pode dar o batch_id (obrigatório em import_rows).
    const withBatch = prepared.map(row => ({ ...row, batch_id: newBatch.id }));
    const inserted: any[] = [];
    for (let i = 0; i < withBatch.length; i += 500) {
      const { data, error } = await supabase.from("import_rows").insert(withBatch.slice(i, i + 500)).select("*");
      if (error) {
        // Não deixar um lote vazio pendurado no histórico se as linhas falharem.
        await supabase.from("import_batches").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", newBatch.id);
        setMessage(error.message); setBusy(false); return;
      }
      if (data) inserted.push(...data);
    }
    setBatch(newBatch as ImportBatch); setRows(inserted as ImportRow[]); setFile(null); await loadBatches(); setBusy(false);
  };

  const updateRow = async (row: ImportRow, patch: Partial<NormalizedRow>) => {
    const normalized = { ...row.normalized_data, ...patch };
    const check = normalizeRow(row.raw_data, target, accounts, contacts, categories, new Set());
    const mergedBase: NormalizedRow = { ...check.data, ...normalized };
    const key = normalizedKey(target, mergedBase);
    const duplicate = existingKeys(target, journalEntries, obligations).has(key) || rows.some(other => other.id !== row.id && normalizedKey(target, other.normalized_data) === key);
    const merged: NormalizedRow = { ...mergedBase, duplicate, duplicate_reason: duplicate ? "Já existe um lançamento semelhante no ZeroMaka ou nesta importação." : undefined };
    const error = target === "transaction"
      ? (Number(merged.amount) <= 0 ? "Valor inválido" : !dateOk(merged.date) ? "Data inválida" : !merged.account_id ? "Conta obrigatória" : undefined)
      : (Number(merged.amount) <= 0 ? "Valor inválido" : !dateOk(merged.issue_date) ? "Emissão inválida" : !merged.contact_id ? "Contacto obrigatório" : !dateOk(merged.due_date) || (merged.due_date || "") < (merged.issue_date || "") ? "Vencimento inválido" : undefined);
    const next: ImportRow = { ...row, normalized_data: merged, duplicate_key: duplicate ? key : null, validation_status: (error ? "error" : "ready") as ImportRow["validation_status"], error_message: error, decision: "pending" };
    setRows(prev => prev.map(r => r.id === row.id ? next : r));
    await supabase.from("import_rows").update({ normalized_data: merged, duplicate_key: next.duplicate_key, validation_status: next.validation_status, error_message: error, decision: "pending" }).eq("id", row.id);
  };

  const decide = async (row: ImportRow, decision: Decision) => {
    const status: ImportRow["validation_status"] = decision === "discard" ? "discarded" : row.error_message ? "error" : "ready";
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, decision, validation_status: status } : r));
    await supabase.from("import_rows").update({ decision, validation_status: status }).eq("id", row.id);
  };

  const decideGroup = async (key: string, decision: Decision) => {
    const group = rows.filter(r => r.duplicate_key === key);
    for (const row of group) await decide(row, decision);
  };

  const approveNonDuplicates = async () => {
    setBusy(true);
    const eligible = rows.filter(r => r.validation_status === "ready" && !r.normalized_data.duplicate);
    for (const row of eligible) await decide(row, "keep");
    setBusy(false);
  };

  const applyApproved = async () => {
    const approved = rows.filter(r => r.decision === "keep" && r.validation_status === "ready");
    if (!approved.length) { setMessage("Aprova pelo menos uma linha válida antes de continuar."); return; }
    setBusy(true); setMessage("");
    let errors = 0;
    for (const row of approved) {
      const { error } = await supabase.rpc("apply_import_row", {
        p_row_id: row.id,
        p_account_id: row.normalized_data.account_id || null,
        p_contact_id: row.normalized_data.contact_id || null,
        p_category_id: row.normalized_data.category_id || null,
      });
      if (error) {
        errors++;
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, validation_status: "error", error_message: error.message } : r));
      } else {
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, validation_status: "applied" } : r));
      }
    }
    await supabase.from("import_batches").update({ status: errors ? "partial_error" : "applied", completed_at: new Date().toISOString() }).eq("id", batch?.id);
    setMessage(errors ? "Algumas linhas falharam e ficaram marcadas para correção." : "Linhas aprovadas lançadas com sucesso.");
    await loadBatches();
    setBusy(false);
    if (!errors) router.refresh();
  };

  const cancelImport = async () => {
    if (!batch) return;
    await supabase.from("import_batches").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", batch.id);
    setMessage("Importação cancelada. Nenhum lançamento foi criado para as linhas pendentes.");
    await loadBatches();
  };

  const groups = useMemo(() => {
    const map = new Map<string, ImportRow[]>();
    rows.filter(r => r.duplicate_key).forEach(row => {
      const key = row.duplicate_key || "";
      map.set(key, [...(map.get(key) || []), row]);
    });
    return Array.from(map.entries()).filter(([, group]) => group.length > 0);
  }, [rows]);

  const counts = useMemo(() => ({
    all: rows.length,
    ready: rows.filter(r => r.validation_status === "ready" && !r.normalized_data.duplicate).length,
    duplicate: rows.filter(r => !!r.duplicate_key).length,
    error: rows.filter(r => r.validation_status === "error").length,
    discarded: rows.filter(r => r.decision === "discard").length,
  }), [rows]);

  const visibleRows = useMemo(() => rows.filter(row => {
    if (filter === "ready") return row.validation_status === "ready" && !row.normalized_data.duplicate;
    if (filter === "duplicate") return !!row.duplicate_key;
    if (filter === "error") return row.validation_status === "error";
    if (filter === "discarded") return row.decision === "discard";
    return true;
  }), [rows, filter]);

  const reset = () => { setBatch(null); setRows([]); setFile(null); setMessage(""); };

  const label = batch ? TARGET_LABEL[batch.target_type] : TARGET_LABEL[target];
  const pendingApproved = rows.filter(r => r.decision === "keep" && r.validation_status === "ready").length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">Importar lançamentos</h1>
          <p className="text-sm text-ink-400 mt-1">Migra dados antigos para {label} com revisão antes de lançar.</p>
        </div>
        <button className="btn-ghost" onClick={() => setShowHistory(v => !v)}><RotateCcw size={14} /> Histórico</button>
      </header>

      {showHistory && (
        <section className="card p-4">
          <div className="text-sm font-semibold mb-3">Importações anteriores</div>
          <div className="grid gap-2">
            {batches.map(item => (
              <button key={item.id} onClick={() => void loadRows(item)} className="text-left rounded-lg border border-ink-800 hover:border-maka-500/50 p-3 flex items-center gap-3">
                <FileText size={16} className="text-maka-400" />
                <span className="flex-1 min-w-0"><span className="block truncate text-sm">{item.source_file_name}</span><span className="text-[11px] text-ink-500">{TARGET_LABEL[item.target_type]} · {item.total_rows} linhas · {fmtDate(item.created_at.slice(0, 10))}</span></span>
                <span className="text-[10px] uppercase text-ink-500">{item.status}</span>
              </button>
            ))}
            {!batches.length && <p className="text-sm text-ink-500">Ainda não existem importações.</p>}
          </div>
        </section>
      )}

      {!batch && (
        <section className="card p-6 space-y-5">
          <div className="grid md:grid-cols-3 gap-2">
            {(["transaction", "receivable", "payable"] as TargetType[]).map(value => (
              <button key={value} onClick={() => setTarget(value)} className={"rounded-lg border p-4 text-left " + (target === value ? "border-maka-500 bg-maka-500/10" : "border-ink-800 hover:border-ink-600")}>
                <div className="text-sm font-semibold">{TARGET_LABEL[value]}</div>
                <div className="text-[11px] text-ink-500 mt-1">Rever e aprovar antes do lançamento</div>
              </button>
            ))}
          </div>
          <label className="rounded-xl border border-dashed border-ink-700 hover:border-maka-500/60 p-10 text-center block cursor-pointer">
            <FileSpreadsheet className="mx-auto text-maka-400" size={32} />
            <div className="text-sm mt-3">{file ? file.name : "Escolher Excel, CSV ou PDF"}</div>
            <div className="text-[11px] text-ink-500 mt-1">Excel .xlsx, CSV até 5.000 linhas ou PDF textual · máximo 10 MB</div>
            <input type="file" accept=".xlsx,.csv,.tsv,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <button className="btn-primary w-full justify-center" disabled={!file || busy} onClick={() => void createImport()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {busy ? "A ler ficheiro…" : "Ler e preparar revisão"}</button>
          {message && <p className="text-sm text-red-400">{message}</p>}
        </section>
      )}

      {batch && (
        <>
          <section className="card p-4 flex flex-wrap items-center gap-3">
            <FileText size={18} className="text-maka-400" />
            <div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{batch.source_file_name}</div><div className="text-[11px] text-ink-500">{TARGET_LABEL[batch.target_type]} · {rows.length} linhas</div></div>
            <div className="flex gap-2 text-xs"><span className="rounded-full bg-emerald-500/10 text-emerald-400 px-2 py-1">{counts.ready} válidas</span><span className="rounded-full bg-amber-500/10 text-amber-400 px-2 py-1">{counts.duplicate} duplicadas</span><span className="rounded-full bg-red-500/10 text-red-400 px-2 py-1">{counts.error} erros</span></div>
            <button className="btn-ghost" onClick={reset}><X size={14} /> Nova</button>
          </section>

          <section className="rounded-xl border border-maka-500/30 bg-maka-500/5 p-4 flex gap-3">
            <ShieldCheck size={19} className="text-maka-400 shrink-0 mt-0.5" />
            <div className="text-sm text-ink-300"><strong className="text-ink-100">Nada foi lançado ainda.</strong> Revê as linhas, resolve os duplicados e aprova apenas o que queres importar. Os dados aprovados serão enviados para o mesmo diário usado pelos lançamentos normais.</div>
          </section>

          {groups.length > 0 && (
            <section className="card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3"><div><div className="font-semibold flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" /> Blocos duplicados</div><p className="text-xs text-ink-500 mt-1">Inclui repetições no ficheiro e lançamentos semelhantes já existentes.</p></div><span className="text-xs text-amber-400">{groups.length} grupo{groups.length !== 1 ? "s" : ""}</span></div>
              {groups.slice(0, 30).map(([key, group]) => (
                <div key={key} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">Grupo com {group.length} linha{group.length !== 1 ? "s" : ""}</span><div className="flex gap-1"><button className="btn-ghost text-xs" onClick={() => void decideGroup(key, "keep")}><Check size={13} /> Manter todos</button><button className="btn-ghost text-xs text-red-400" onClick={() => void decideGroup(key, "discard")}><Trash2 size={13} /> Eliminar todos</button></div></div>
                  <div className="mt-2 grid gap-1">{group.map(row => <div key={row.id} className="text-xs flex gap-3"><span className="text-ink-500 w-8">#{row.row_number}</span><span className="flex-1 truncate">{row.normalized_data.description}</span><span>{fmtKz(Number(row.normalized_data.amount || 0))}</span><span className={row.decision === "discard" ? "text-red-400" : row.decision === "keep" ? "text-emerald-400" : "text-amber-400"}>{row.decision === "discard" ? "eliminar" : row.decision === "keep" ? "manter" : "decidir"}</span></div>)}</div>
                </div>
              ))}
              {groups.length > 30 && <p className="text-xs text-ink-500">A lista mostra os primeiros 30 grupos; todas as linhas continuam disponíveis abaixo.</p>}
            </section>
          )}

          <section className="flex flex-wrap gap-2 items-center">
            {(["all", "ready", "duplicate", "error", "discarded"] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={"rounded-full px-3 py-1.5 text-xs border " + (filter === value ? "border-maka-500 bg-maka-500/10 text-maka-300" : "border-ink-800 text-ink-400")}>{value === "all" ? "Todas" : value === "ready" ? "Válidas" : value === "duplicate" ? "Duplicadas" : value === "error" ? "Com erro" : "Eliminadas"}</button>)}
            <span className="flex-1" />
            <span className="text-xs text-ink-500">{pendingApproved} aprovadas para lançar</span>
            <button className="btn-ghost" disabled={busy || !counts.ready} onClick={() => void approveNonDuplicates()}><Check size={14} /> Aprovar válidas</button>
            <button className="btn-primary" disabled={busy || !pendingApproved} onClick={() => void applyApproved()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lançar aprovadas</button>
            <button className="btn-ghost text-red-400" disabled={busy} onClick={() => void cancelImport()}>Cancelar importação</button>
          </section>

          <section className="card divide-y divide-ink-800">
            {visibleRows.slice(0, 300).map(row => {
              const n = row.normalized_data;
              const isOpen = expanded === row.id;
              return (
                <div key={row.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <button className="text-ink-500" onClick={() => setExpanded(isOpen ? null : row.id)}><ChevronDown size={15} className={isOpen ? "rotate-180" : ""} /></button>
                    <span className="text-[11px] text-ink-500 w-8">#{row.row_number}</span>
                    <div className="min-w-0 flex-1"><div className="text-sm truncate">{n.description || "Sem descrição"}</div><div className="text-[11px] text-ink-500">{target === "transaction" ? n.date : (n.issue_date || "sem emissão")} {n.contact_name ? " · " + n.contact_name : ""} {n.account_name ? " · " + n.account_name : ""}</div></div>
                    <span className="text-sm font-semibold shrink-0">{fmtKz(Number(n.amount || 0))}</span>
                    {row.normalized_data.duplicate && <span className="text-[10px] text-amber-400">duplicado</span>}
                    <span className={"text-[10px] uppercase shrink-0 " + (row.validation_status === "error" ? "text-red-400" : row.validation_status === "applied" ? "text-emerald-400" : row.decision === "discard" ? "text-ink-500" : row.decision === "keep" ? "text-emerald-400" : "text-amber-400")}>{row.validation_status === "applied" ? "lançado" : row.decision === "discard" ? "eliminado" : row.decision === "keep" ? "aprovado" : row.validation_status === "error" ? "erro" : "pendente"}</span>
                    <div className="flex gap-1 shrink-0"><button className="btn-ghost text-xs" disabled={row.validation_status === "error"} onClick={() => void decide(row, "keep")}><Check size={13} /> Aprovar</button><button className="btn-ghost text-xs text-red-400" onClick={() => void decide(row, "discard")}><Trash2 size={13} /> Eliminar</button></div>
                  </div>
                  {row.error_message && <div className="ml-11 mt-2 text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {row.error_message}</div>}
                  {isOpen && (
                    <div className="ml-11 mt-3 grid md:grid-cols-4 gap-3 rounded-lg bg-ink-950/60 p-3">
                      <div><label className="label">{target === "transaction" ? "Data" : "Emissão"}</label><input className="input" type="date" value={(target === "transaction" ? n.date : n.issue_date) || ""} onChange={e => void updateRow(row, target === "transaction" ? { date: e.target.value } : { issue_date: e.target.value })} /></div>
                      {target !== "transaction" && <div><label className="label">Vencimento</label><input className="input" type="date" value={n.due_date || ""} onChange={e => void updateRow(row, { due_date: e.target.value })} /></div>}
                      <div><label className="label">Valor</label><input className="input" type="number" value={n.amount || ""} onChange={e => void updateRow(row, { amount: Number(e.target.value) })} /></div>
                      <div className="md:col-span-2"><label className="label">Descrição</label><input className="input" value={n.description || ""} onChange={e => void updateRow(row, { description: e.target.value })} /></div>
                      {target === "transaction" ? <><div><label className="label">Conta</label><select className="input" value={n.account_id || ""} onChange={e => void updateRow(row, { account_id: e.target.value, account_name: accounts.find(a => a.id === e.target.value)?.name })}><option value="">Selecionar</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div><label className="label">Tipo</label><select className="input" value={n.direction || "expense"} onChange={e => void updateRow(row, { direction: e.target.value as "income" | "expense" })}><option value="expense">Despesa</option><option value="income">Receita</option></select></div></> : <div><label className="label">{target === "receivable" ? "Cliente" : "Fornecedor"}</label><select className="input" value={n.contact_id || ""} onChange={e => void updateRow(row, { contact_id: e.target.value, contact_name: contacts.find(c => c.id === e.target.value)?.name })}><option value="">Selecionar</option>{contacts.filter(c => !c.isArchived && (c.kind === "ambos" || c.kind === (target === "receivable" ? "cliente" : "fornecedor"))).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
                      <div><label className="label">Categoria</label><select className="input" value={n.category_id || ""} onChange={e => void updateRow(row, { category_id: e.target.value, category_name: categories.find(c => c.id === e.target.value)?.name })}><option value="">Sem categoria</option>{categories.filter(c => target === "transaction" || c.categoryType === (target === "receivable" ? "income" : "expense")).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    </div>
                  )}
                </div>
              );
            })}
            {!visibleRows.length && <div className="p-10 text-center text-sm text-ink-500">Não há linhas neste filtro.</div>}
            {visibleRows.length > 300 && <div className="p-3 text-center text-xs text-ink-500">A mostrar 300 de {visibleRows.length} linhas. A aprovação aplica-se às linhas aprovadas de todo o ficheiro.</div>}
          </section>
        </>
      )}
    </div>
  );
}
