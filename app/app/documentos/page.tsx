"use client";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Download, FileText, Mail, Paperclip, RefreshCw, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { collectionMessage, fmtDate, fmtKz, whatsappLink } from "@/lib/data";

type Attachment = { id: string; organization_id: string; entity_type: string; entity_id?: string; file_name: string; storage_path: string; mime_type: string; byte_size: number; description?: string; created_at: string };
type Notification = { id: string; kind: string; title: string; body: string; href?: string; read_at?: string; created_at: string; metadata?: Record<string, unknown> };
const ENTITY_LABELS: Record<string, string> = { journal_entry: "Lançamento", obligation: "Obrigação", settlement: "Liquidação", requisition: "Requisição", other: "Outro" };
const safeName = (name: string) => name.normalize("NFD").replace(/[^\w. -]/g, "").trim().replace(/\s+/g, "-").slice(0, 90) || "documento";
const fmtSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function DocumentosPage() {
  const { orgId, obligations, journalEntries, contacts } = useStore();
  const supabase = useMemo(() => createClient(), []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [entityType, setEntityType] = useState("obligation");
  const [entityId, setEntityId] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    const [a, n] = await Promise.all([
      supabase.from("file_attachments").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("financial_notifications").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (a.data) setAttachments(a.data.map(x => ({ ...x, byte_size: Number(x.byte_size) })));
    if (n.data) setNotifications(n.data);
    if (a.error || n.error) setMessage((a.error || n.error)?.message || "Não foi possível carregar os documentos.");
  }, [orgId, supabase]);
  useEffect(() => { load(); }, [load]);

  const entityOptions = useMemo(() => {
    if (entityType === "obligation") return obligations.map(o => ({ id: o.id, label: `${o.internalNumber} · ${o.contactName || "Contacto"} · ${fmtKz(o.originalAmount)}` }));
    if (entityType === "journal_entry") return journalEntries.slice(0, 100).map(e => ({ id: e.id, label: `${e.entryNumber} · ${e.description}` }));
    return [];
  }, [entityType, journalEntries, obligations]);
  const unread = notifications.filter(n => !n.read_at).length;
  const notificationObligation = (notification: Notification) => {
    const obligationId = notification.metadata?.obligation_id;
    return typeof obligationId === "string" ? obligations.find(o => o.id === obligationId) : undefined;
  };
  const notificationContact = (notification: Notification) => {
    const obligation = notificationObligation(notification);
    return obligation ? contacts.find(c => c.id === obligation.contactId) : undefined;
  };
  const notificationText = (notification: Notification) => {
    const obligation = notificationObligation(notification);
    return obligation
      ? collectionMessage(obligation.contactName || "cliente", obligation.internalNumber, obligation.outstandingAmount, obligation.dueDate)
      : notification.body;
  };
  const emailLink = (notification: Notification) => {
    const contact = notificationContact(notification);
    if (!contact?.email) return "";
    return `mailto:${contact.email}?subject=${encodeURIComponent(notification.title)}&body=${encodeURIComponent(notificationText(notification))}`;
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setMessage("");
    if (selected && selected.size > 10 * 1024 * 1024) { setMessage("O ficheiro não pode ultrapassar 10 MB."); setFile(null); return; }
    setFile(selected); event.target.value = "";
  };
  const upload = async () => {
    if (!orgId || !file) return;
    setLoading(true); setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("Sessão expirada."); setLoading(false); return; }
    const storagePath = `${orgId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const uploadResult = await supabase.storage.from("financial-attachments").upload(storagePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (uploadResult.error) { setMessage(uploadResult.error.message); setLoading(false); return; }
    const { error } = await supabase.from("file_attachments").insert({ organization_id: orgId, uploaded_by: user.id, entity_type: entityType, entity_id: entityId || null, file_name: file.name, storage_path: storagePath, mime_type: file.type || "application/octet-stream", byte_size: file.size, description: description.trim() || null });
    if (error) { await supabase.storage.from("financial-attachments").remove([storagePath]); setMessage(error.message); setLoading(false); return; }
    setFile(null); setDescription(""); setEntityId(""); setLoading(false); await load();
  };
  const download = async (attachment: Attachment) => {
    const { data, error } = await supabase.storage.from("financial-attachments").createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) { setMessage(error?.message || "Não foi possível abrir o ficheiro."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const remove = async (attachment: Attachment) => {
    const { error } = await supabase.from("file_attachments").update({ is_deleted: true }).eq("id", attachment.id);
    if (!error) await supabase.storage.from("financial-attachments").remove([attachment.storage_path]);
    if (error) setMessage(error.message); else await load();
  };
  const refreshNotifications = async () => {
    if (!orgId) return;
    const { error } = await supabase.rpc("refresh_financial_notifications", { p_org_id: orgId });
    if (error) setMessage(error.message); else await load();
  };
  const markRead = async (id: string) => { await supabase.rpc("mark_financial_notification_read", { p_notification_id: id }); await load(); };
  const markAllRead = async () => { if (orgId) { await supabase.rpc("mark_all_financial_notifications_read", { p_org_id: orgId }); await load(); } };

  return <div className="max-w-6xl mx-auto space-y-6">
    <header className="flex items-end justify-between flex-wrap gap-3"><div><div className="flex items-center gap-2 text-maka-400 text-sm font-semibold"><Paperclip size={17} /> Evidência e acompanhamento</div><h1 className="h-page mt-1">Documentos e alertas</h1><p className="text-sm text-ink-400 mt-1">Guarda comprovativos privados e acompanha o que exige atenção.</p></div><button className="btn-ghost" onClick={load}><RefreshCw size={15} /> Atualizar</button></header>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><section className="card p-5 space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Upload size={16} className="text-maka-400" /> Anexar ficheiro</div><span className="text-[11px] text-ink-500">Máximo 10 MB</span></div><div className="grid grid-cols-2 gap-2"><div><label className="label">Associar a</label><select className="input" value={entityType} onChange={e => { setEntityType(e.target.value); setEntityId(""); }}><option value="obligation">Obrigação</option><option value="journal_entry">Lançamento</option><option value="other">Outro</option></select></div><div><label className="label">Documento</label><select className="input" value={entityId} onChange={e => setEntityId(e.target.value)} disabled={entityOptions.length === 0}><option value="">Sem associação</option>{entityOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div></div><div><label className="label">Descrição</label><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: comprovativo de pagamento" /></div><label className="rounded-lg border border-dashed border-ink-700 hover:border-maka-500/50 p-5 text-center block cursor-pointer"><FileText className="mx-auto text-ink-500" size={24} /><div className="text-sm mt-2">{file ? file.name : "Escolher PDF, imagem ou outro ficheiro"}</div>{file && <div className="text-xs text-ink-500 mt-1">{fmtSize(file.size)}</div>}<input type="file" className="hidden" onChange={handleFile} /></label><button className="btn-primary w-full" disabled={!file || loading} onClick={upload}>{loading ? "A enviar…" : "Guardar anexo"}</button>{message && <p className="text-sm text-red-400">{message}</p>}</section>

      <section className="card overflow-hidden"><div className="p-5 border-b border-ink-800 flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Bell size={16} className="text-maka-400" /> Notificações {unread > 0 && <span className="rounded-full bg-red-500/20 text-red-300 text-[10px] px-1.5 py-0.5">{unread}</span>}</div><p className="text-xs text-ink-500 mt-1">Alertas gerados para documentos vencidos e próximos do vencimento.</p></div><div className="flex gap-2"><button className="btn-ghost text-xs" onClick={refreshNotifications}>Gerar alertas</button>{unread > 0 && <button className="btn-ghost text-xs" onClick={markAllRead}>Marcar lidos</button>}</div></div>{notifications.length === 0 ? <div className="p-8 text-center text-sm text-ink-500">Ainda não há notificações. Clica em “Gerar alertas”.</div> : <div className="divide-y divide-ink-800 max-h-[330px] overflow-y-auto">{notifications.map(n => <div key={n.id} className={`p-4 ${!n.read_at ? "bg-maka-500/5" : ""}`}><div className="flex justify-between gap-3"><div><div className="font-medium text-sm">{n.title}</div><div className="text-xs text-ink-400 mt-1">{n.body}</div><div className="text-[11px] text-ink-600 mt-1">{fmtDate(n.created_at)}</div></div><div className="flex flex-wrap items-center justify-end gap-1">{notificationContact(n)?.phone && <a className="btn-ghost text-xs" href={whatsappLink(notificationContact(n)?.phone || "", notificationText(n))} target="_blank" rel="noreferrer">WhatsApp</a>}{emailLink(n) && <a className="btn-ghost text-xs" href={emailLink(n)}><Mail size={13} /> E-mail</a>}{!n.read_at && <button className="btn-ghost text-xs whitespace-nowrap" onClick={() => markRead(n.id)}><Check size={13} /> Lido</button>}</div></div></div>)}</div>}</section></div>

    <section className="card overflow-hidden"><div className="p-5 border-b border-ink-800"><h2 className="font-semibold">Ficheiros guardados</h2><p className="text-xs text-ink-500 mt-1">Os anexos ficam privados e associados à organização.</p></div>{attachments.length === 0 ? <div className="p-10 text-center text-sm text-ink-500">Ainda não há anexos.</div> : <div className="divide-y divide-ink-800">{attachments.map(a => <div key={a.id} className="p-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3 min-w-0"><div className="h-9 w-9 rounded-lg bg-maka-500/10 text-maka-400 flex items-center justify-center shrink-0"><FileText size={17} /></div><div className="min-w-0"><div className="font-medium text-sm truncate">{a.file_name}</div><div className="text-xs text-ink-500 mt-1">{ENTITY_LABELS[a.entity_type] || a.entity_type} · {fmtSize(a.byte_size)} · {fmtDate(a.created_at)}</div></div></div><div className="flex gap-1"><button className="btn-ghost text-xs" onClick={() => download(a)}><Download size={13} /> Abrir</button><button className="text-ink-500 hover:text-red-400 p-2" onClick={() => remove(a)} title="Remover anexo"><Trash2 size={15} /></button></div></div>)}</div>}</section>
  </div>;
}