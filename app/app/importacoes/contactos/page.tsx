"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FileSpreadsheet, Loader2, Upload, Users, X } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  CONTACT_IMPORT_FIELDS, ContactImportField, ContactImportFields, ExistingImportContact,
  ImportContactKind, contactFromRow, createContactDuplicateIndex, detectContactColumns,
  parseContactPaymentTerm,
} from "@/lib/imports/contact-import";

type Parsed = {
  headers: string[];
  rows: Record<string, string>[];
  sourceFileName: string;
  sheets: string[];
  sheetName: string | null;
  truncated: boolean;
};
type Draft = ContactImportFields & { rowNumber: number; selected: boolean };
type Result = { rowNumber: number; status: "created" | "duplicate" | "error"; message?: string };
type Review = { state: "ready" | "duplicate" | "error" | "excluded"; reason?: string };

const PAGE_SIZE = 40;
const FIELDS: { key: ContactImportField; label: string }[] = [
  { key: "name", label: "Nome" }, { key: "nif", label: "NIF" },
  { key: "phone", label: "Telefone" }, { key: "email", label: "E-mail" },
  { key: "location", label: "Localização" }, { key: "paymentTerm", label: "Prazo de pagamento" },
  { key: "notes", label: "Notas" },
];

function reviewDrafts(drafts: Draft[], contacts: ExistingImportContact[], results: Record<number, Result>): Map<number, Review> {
  const seen = createContactDuplicateIndex(contacts);
  const reviews = new Map<number, Review>();
  for (const draft of drafts) {
    if (results[draft.rowNumber]?.status === "created") {
      reviews.set(draft.rowNumber, { state: "excluded", reason: "Já importado" });
      continue;
    }
    if (!draft.selected) { reviews.set(draft.rowNumber, { state: "excluded", reason: "Excluído da importação" }); continue; }
    if (!draft.name.trim()) { reviews.set(draft.rowNumber, { state: "error", reason: "Nome em falta" }); continue; }
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      reviews.set(draft.rowNumber, { state: "error", reason: "E-mail inválido" }); continue;
    }
    if (draft.paymentTerm && !parseContactPaymentTerm(draft.paymentTerm)) {
      reviews.set(draft.rowNumber, { state: "error", reason: "Prazo de pagamento não reconhecido" }); continue;
    }
    const duplicate = seen.find(draft);
    if (duplicate) {
      const label = { nif: "NIF", phone: "telefone", email: "e-mail", name: "nome" }[duplicate.field];
      reviews.set(draft.rowNumber, { state: "duplicate", reason: `${label} já usado por ${duplicate.match.name}` });
      continue;
    }
    reviews.set(draft.rowNumber, { state: "ready" });
    seen.add({ ...draft, kind: "ficheiro" });
  }
  return reviews;
}

export default function ImportarContactosPage() {
  const { orgId, contacts, refreshContacts } = useStore();
  const [kind, setKind] = useState<ImportContactKind>("cliente");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ContactImportField, string>>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const existing = useMemo<ExistingImportContact[]>(() => contacts.map(c => ({
    id: c.id, name: c.name, kind: c.kind, nif: c.nif, phone: c.phone, email: c.email,
  })), [contacts]);
  const reviews = useMemo(() => reviewDrafts(drafts, existing, results), [drafts, existing, results]);
  const summary = useMemo(() => {
    const out = { ready: 0, duplicate: 0, error: 0, excluded: 0, created: 0 };
    for (const draft of drafts) {
      if (results[draft.rowNumber]?.status === "created") { out.created++; continue; }
      out[reviews.get(draft.rowNumber)?.state || "error"]++;
    }
    return out;
  }, [drafts, reviews, results]);
  const visible = drafts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));

  const chooseFile = async (chosen: File | null) => {
    setFile(chosen); setSheets([]); setSheetName(""); setParsed(null); setDrafts([]);
    setPrepared(false); setResults({}); setMessage(""); setPage(0);
    if (!chosen || !chosen.name.toLowerCase().endsWith(".xlsx")) return;
    const form = new FormData();
    form.append("file", chosen); form.append("targetType", "contacts"); form.append("mode", "inspect");
    try {
      const response = await fetch("/api/imports/parse", { method: "POST", body: form });
      const value = await response.json();
      if (response.ok && Array.isArray(value.sheets)) setSheets(value.sheets);
    } catch { /* A leitura normal continua disponível sem seleção de folha. */ }
  };

  const readFile = async () => {
    if (!file) return;
    setBusy(true); setMessage(""); setParsed(null); setPrepared(false); setDrafts([]); setResults({});
    const form = new FormData();
    form.append("file", file); form.append("targetType", "contacts");
    if (sheetName) form.append("sheetName", sheetName);
    try {
      const response = await fetch("/api/imports/parse", { method: "POST", body: form });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Não foi possível ler o ficheiro");
      setParsed(value as Parsed);
      setMapping(detectContactColumns(value.headers || []));
      setSheets(value.sheets || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ler o ficheiro");
    } finally { setBusy(false); }
  };

  const prepareReview = () => {
    if (!parsed) return;
    if (!mapping.name) { setMessage("Indica qual coluna contém o nome do cliente ou fornecedor."); return; }
    setDrafts(parsed.rows.map((raw, index) => ({ ...contactFromRow(raw, mapping), rowNumber: index + 1, selected: true })));
    setResults({}); setPrepared(true); setPage(0); setMessage("");
  };

  const updateDraft = (rowNumber: number, patch: Partial<Draft>) => {
    setDrafts(prev => prev.map(row => row.rowNumber === rowNumber ? { ...row, ...patch } : row));
    setResults(prev => {
      if (!prev[rowNumber]) return prev;
      const next = { ...prev }; delete next[rowNumber]; return next;
    });
  };

  const confirmImport = async () => {
    if (!orgId) { setMessage("Escolhe uma organização antes de importar."); return; }
    const eligible = drafts.filter(row => reviews.get(row.rowNumber)?.state === "ready" && results[row.rowNumber]?.status !== "created");
    if (!eligible.length) { setConfirmOpen(false); return; }
    setBusy(true); setConfirmOpen(false); setMessage("");
    let created = 0, duplicates = 0, errors = 0;
    try {
      for (let offset = 0; offset < eligible.length; offset += 200) {
        const chunk = eligible.slice(offset, offset + 200);
        const response = await fetch("/api/imports/contacts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, kind, rows: chunk.map(({ rowNumber, selected, ...data }) => ({ rowNumber, data })) }),
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "Não foi possível guardar estes contactos");
        const chunkResults = (value.results || []) as Result[];
        setResults(prev => Object.fromEntries([...Object.entries(prev), ...chunkResults.map(item => [item.rowNumber, item])]));
        created += Number(value.created) || 0;
        duplicates += Number(value.duplicates) || 0;
        errors += Number(value.errors) || 0;
      }
      setMessage(`${created} contacto${created === 1 ? "" : "s"} criado${created === 1 ? "" : "s"}. ${duplicates} duplicado${duplicates === 1 ? "" : "s"} ignorado${duplicates === 1 ? "" : "s"}. ${errors} com erro.`);
    } catch (error) {
      setMessage(`${created} já criados nesta tentativa. ${error instanceof Error ? error.message : "A importação foi interrompida"} Podes voltar a confirmar os restantes.`);
    } finally {
      try { await refreshContacts(); } catch { /* Os resultados do servidor continuam visíveis. */ }
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <header className="space-y-3">
        <Link href="/app/importacoes" className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100"><ArrowLeft size={15} /> Voltar às importações</Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="h-page">Importar contactos</h1>
            <p className="text-sm text-ink-400 mt-1">Lê a lista, confere os nomes e só grava depois da tua confirmação.</p>
          </div>
          <Link href="/app/contactos" className="btn-ghost inline-flex items-center gap-2"><Users size={15} /> Ver contactos</Link>
        </div>
      </header>

      <section className="card p-5 space-y-4" aria-label="Escolher ficheiro">
        <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div>
            <label className="label" htmlFor="contact-kind">Importar</label>
            <select id="contact-kind" className="input" value={kind} disabled={busy} onChange={event => setKind(event.target.value as ImportContactKind)}>
              <option value="cliente">Clientes</option><option value="fornecedor">Fornecedores</option>
            </select>
          </div>
          <label className="block cursor-pointer">
            <span className="label">Ficheiro Excel ou CSV</span>
            <span className="input flex min-h-11 items-center gap-2 hover:border-maka-500/60">
              <FileSpreadsheet size={16} className="shrink-0 text-maka-400" />
              <span className="truncate">{file?.name || "Escolher ficheiro Excel, CSV ou TSV"}</span>
            </span>
            <input id="contacts-file" className="sr-only" type="file" accept=".xlsx,.csv,.tsv" disabled={busy}
              onChange={event => void chooseFile(event.target.files?.[0] || null)} />
          </label>
          <button type="button" className="btn-primary" disabled={!file || busy} onClick={() => void readFile()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Ler ficheiro
          </button>
        </div>
        {sheets.length > 1 && (
          <div className="max-w-sm"><label className="label" htmlFor="contacts-sheet">Folha do Excel</label>
            <select id="contacts-sheet" className="input" value={sheetName} disabled={busy} onChange={event => setSheetName(event.target.value)}>
              <option value="">Primeira folha com dados</option>
              {sheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
            </select>
          </div>
        )}
        <p className="text-xs text-ink-500">Nome é obrigatório. NIF, telefone, e-mail e localização só são preenchidos se vierem no ficheiro. Nenhum lançamento financeiro é criado aqui.</p>
      </section>

      {parsed && !prepared && (
        <section className="card p-5 space-y-5">
          <div className="flex gap-3 items-center"><FileSpreadsheet size={20} className="text-maka-400" />
            <div><h2 className="font-semibold">Ligar colunas</h2><p className="text-xs text-ink-400">{parsed.rows.length} linhas encontradas em {parsed.sheetName || parsed.sourceFileName}. Confirma o mapeamento antes da revisão.</p></div>
          </div>
          {parsed.truncated && <p className="text-sm text-amber-400">O ficheiro foi limitado às primeiras 5 000 linhas. Divide-o para importar o resto.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FIELDS.map(field => <div key={field.key}>
              <label className="label" htmlFor={`mapping-${field.key}`}>{field.label}{field.key === "name" ? " *" : ""}</label>
              <select id={`mapping-${field.key}`} className="input" value={mapping[field.key] || ""}
                onChange={event => setMapping(prev => ({ ...prev, [field.key]: event.target.value || undefined }))}>
                <option value="">Não existe no ficheiro</option>
                {parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}
              </select>
            </div>)}
          </div>
          <button type="button" className="btn-primary" onClick={prepareReview}>Preparar revisão</button>
        </section>
      )}

      {prepared && (
        <section className="card overflow-hidden">
          <div className="p-5 border-b border-ink-700 flex justify-between gap-4 flex-wrap items-center">
            <div><h2 className="font-semibold">Revisão antes de guardar</h2>
              <p className="text-xs text-ink-400 mt-1">{summary.ready} prontos · {summary.duplicate} duplicados · {summary.error} por corrigir · {summary.excluded} excluídos · {summary.created} criados</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setPrepared(false); setResults({}); }}>Alterar colunas</button>
              <button type="button" className="btn-primary" disabled={busy || !orgId || !summary.ready} onClick={() => setConfirmOpen(true)}>
                <Check size={15} /> Confirmar {summary.ready} contacto{summary.ready === 1 ? "" : "s"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-ink-900/50 text-ink-400 text-left text-xs"><tr>
                <th className="p-3">Linha</th><th className="p-3">Nome</th><th className="p-3">NIF</th>
                <th className="p-3">Telefone</th><th className="p-3">E-mail</th><th className="p-3">Localização</th>
                <th className="p-3">Prazo</th><th className="p-3">Estado</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-700/60">
                {visible.map(row => {
                  const review = reviews.get(row.rowNumber);
                  const result = results[row.rowNumber];
                  const disabled = busy || result?.status === "created";
                  const fieldInput = (key: "name" | "nif" | "phone" | "email" | "location", width: string) =>
                    <input aria-label={`${key} linha ${row.rowNumber}`} className={`input text-xs ${width}`} value={row[key] || ""} disabled={disabled}
                      onChange={event => updateDraft(row.rowNumber, { [key]: event.target.value })} />;
                  return <tr key={row.rowNumber} className={review?.state === "error" ? "bg-red-500/5" : review?.state === "duplicate" ? "bg-amber-500/5" : ""}>
                    <td className="p-3 align-top"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.selected} disabled={disabled}
                      onChange={event => updateDraft(row.rowNumber, { selected: event.target.checked })} /> {row.rowNumber}</label></td>
                    <td className="p-2 align-top">{fieldInput("name", "min-w-[170px]")}</td>
                    <td className="p-2 align-top">{fieldInput("nif", "w-32")}</td>
                    <td className="p-2 align-top">{fieldInput("phone", "w-32")}</td>
                    <td className="p-2 align-top">{fieldInput("email", "min-w-[165px]")}</td>
                    <td className="p-2 align-top">{fieldInput("location", "min-w-[150px]")}</td>
                    <td className="p-2 align-top"><select aria-label={`Prazo linha ${row.rowNumber}`} className="input text-xs w-28" value={parseContactPaymentTerm(row.paymentTerm || "") || (row.paymentTerm ? "invalid" : "")} disabled={disabled}
                      onChange={event => updateDraft(row.rowNumber, { paymentTerm: event.target.value })}>
                      <option value="">Sem prazo</option>
                      {row.paymentTerm && !parseContactPaymentTerm(row.paymentTerm) && <option value="invalid">Não reconhecido</option>}
                      <option value="pronto">A pronto</option><option value="credito15">15 dias</option><option value="credito30">30 dias</option>
                      <option value="credito60">60 dias</option><option value="credito90">90 dias</option><option value="mensal">Mensal</option>
                    </select></td>
                    <td className="p-3 align-top text-xs max-w-[200px]">
                      <span className={result?.status === "created" ? "text-emerald-400" : review?.state === "ready" ? "text-emerald-400" : review?.state === "duplicate" ? "text-amber-400" : review?.state === "error" ? "text-red-400" : "text-ink-500"}>
                        {result?.status === "created" ? "Criado" : result?.status === "error" ? "Erro ao guardar" : review?.state === "ready" ? "Pronto" : review?.state === "duplicate" ? "Duplicado" : review?.state === "error" ? "Corrigir" : "Excluído"}
                      </span>
                      <div className="text-ink-500 mt-1">{result?.message || review?.reason || ""}</div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-ink-700 flex items-center justify-between text-xs text-ink-400">
            <span>Linhas {page * PAGE_SIZE + 1}–{Math.min(drafts.length, (page + 1) * PAGE_SIZE)} de {drafts.length}</span>
            <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
              <button type="button" className="btn-ghost" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Seguinte</button></div>
          </div>
        </section>
      )}

      {message && <p role="status" className="card p-4 text-sm text-ink-200">{message}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirmar importação de contactos">
          <div className="card max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3"><h2 className="font-display text-lg">Guardar {summary.ready} contacto{summary.ready === 1 ? "" : "s"}?</h2>
              <button type="button" aria-label="Fechar" className="text-ink-400 hover:text-ink-100" onClick={() => setConfirmOpen(false)}><X size={18} /></button></div>
            <p className="text-sm text-ink-400">Vão entrar na lista de {kind === "cliente" ? "clientes" : "fornecedores"} da organização atual. Os duplicados e as linhas por corrigir não serão gravados. Não serão criados movimentos financeiros.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setConfirmOpen(false)}>Voltar à revisão</button>
              <button type="button" className="btn-primary" onClick={() => void confirmImport()}>Guardar contactos</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
