"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "./supabase/client";
import {
  Account, Transaction, Invoice, Badge, UserProfile, Company, Contact, Requisition,
  seedBadges, taxRateFor
} from "./data";

interface Toast { id: number; msg: string; kind: "ok" | "xp" | "warn" }

interface Store {
  ready: boolean; authed: boolean; orgId: string | null;
  logout: () => Promise<void>;
  createOrganization: (orgName: string, companyName: string, userName: string) => Promise<void>;
  company: Company; accounts: Account[]; transactions: Transaction[]; invoices: Invoice[];
  contacts: Contact[]; requisitions: Requisition[]; badges: Badge[]; profile: UserProfile; toasts: Toast[];
  updateCompany: (p: Partial<Company>) => void;
  addAccount: (a: Omit<Account, "id" | "currentBalance">) => void;
  editAccount: (id: string, p: Partial<Pick<Account, "name" | "type" | "bank">>) => void;
  deleteAccount: (id: string) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  editTransaction: (id: string, p: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  transfer: (from: string, to: string, amount: number) => string | null;
  addInvoice: (i: Omit<Invoice, "id" | "status">) => void;
  editInvoice: (id: string, p: Partial<Invoice>) => string | null;
  deleteInvoice: (id: string) => string | null;
  markPaid: (invoiceId: string, accountId: string) => void;
  addContact: (c: Omit<Contact, "id">) => void;
  editContact: (id: string, p: Partial<Contact>) => void;
  removeContact: (id: string) => void;
  addRequisition: (r: Omit<Requisition, "id" | "number" | "status">) => void;
  editRequisition: (id: string, p: Partial<Requisition>) => string | null;
  deleteRequisition: (id: string) => string | null;
  approveRequisition: (id: string, accountId: string) => void;
  rejectRequisition: (id: string, reason: string) => void;
  addCapital: (d: { partnerId: string; partnerName: string; kind: "aporte" | "retirada"; amount: number; accountId: string; date: string; description: string }) => string | null;
  updateProfile: (p: Partial<UserProfile>) => void;
  gainXp: (amount: number, reason: string) => void;
  taxRate: number;
}

const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

const LS_GAME = "zeromaka_gamification";

const txDelta = (t: { type: string; amount: number }) =>
  (t.type === "income" || t.type === "transfer_in" || t.type === "capital_in") ? t.amount : -t.amount;

function slugify(text: string): string {
  let s = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  if (s.length < 3) s = s + "-org";
  return s;
}

// ---- DB → Frontend mappers ----
/* eslint-disable @typescript-eslint/no-explicit-any */
const dbToAccount = (r: any): Omit<Account, "currentBalance"> => ({
  id: r.id, name: r.name, type: r.type, bank: r.bank || undefined,
  initialBalance: Number(r.initial_balance),
});

const dbToTransaction = (r: any): Transaction => ({
  id: r.id, accountId: r.account_id, type: r.type, amount: Number(r.amount),
  taxAmount: r.tax_amount ? Number(r.tax_amount) : undefined,
  category: r.category, subcategory: r.subcategory || undefined,
  description: r.description, date: r.date,
  isSale: r.is_sale || undefined, partnerId: r.partner_id || undefined,
  partnerName: r.partner_name || undefined, linkId: r.link_id || undefined,
  invoiceId: r.invoice_id || undefined,
});

const dbToInvoice = (r: any): Invoice => ({
  id: r.id, contactName: r.contact_name, contactId: r.contact_id || undefined,
  type: r.type, amount: Number(r.amount),
  taxAmount: r.tax_amount ? Number(r.tax_amount) : undefined,
  isSale: r.is_sale || undefined, category: r.category,
  issueDate: r.issue_date || undefined, dueDate: r.due_date,
  status: r.status, accountId: r.account_id || undefined,
  paidAt: r.paid_at || undefined, notes: r.notes || undefined,
});

const dbToContact = (r: any): Contact => ({
  id: r.id, name: r.name, kind: r.kind, phone: r.phone || undefined,
  email: r.email || undefined, nif: r.nif || undefined,
  location: r.location || undefined, paymentTerm: r.payment_term || undefined,
  role: r.role || undefined, notes: r.notes || undefined,
});

const dbToRequisition = (r: any): Requisition => ({
  id: r.id, number: r.number, requester: r.requester, approver: r.approver,
  department: r.department || undefined, items: (r.items as any[]) || undefined,
  amount: Number(r.amount), date: r.date, purpose: r.purpose, category: r.category,
  status: r.status, accountId: r.account_id || undefined,
  decidedAt: r.decided_at || undefined, reason: r.reason || undefined,
});

const dbToCompany = (r: any): Company => ({
  name: r.name, nif: r.nif, regime: r.regime, address: r.address, phone: r.phone,
  email: r.email || undefined, logo: r.logo_url || undefined,
  commissions: {
    paysCommercial: r.pays_commercial, members: (r.commission_members as any[]) || [],
    paysClients: r.pays_clients, clientPercent: Number(r.client_percent), clientNote: r.client_note,
  },
});

// ---- Frontend → DB mappers ----
const companyToDb = (p: Partial<Company>) => {
  const row: Record<string, any> = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.nif !== undefined) row.nif = p.nif;
  if (p.logo !== undefined) row.logo_url = p.logo;
  if (p.regime !== undefined) row.regime = p.regime;
  if (p.address !== undefined) row.address = p.address;
  if (p.phone !== undefined) row.phone = p.phone;
  if (p.email !== undefined) row.email = p.email;
  if (p.commissions) {
    row.pays_commercial = p.commissions.paysCommercial;
    row.commission_members = p.commissions.members;
    row.pays_clients = p.commissions.paysClients;
    row.client_percent = p.commissions.clientPercent;
    row.client_note = p.commissions.clientNote;
  }
  return row;
};

const txToDb = (t: Transaction, orgId: string) => ({
  id: t.id, organization_id: orgId, account_id: t.accountId, type: t.type,
  amount: t.amount, tax_amount: t.taxAmount ?? null, category: t.category,
  subcategory: t.subcategory ?? null, description: t.description, date: t.date,
  is_sale: t.isSale ?? false, partner_id: t.partnerId ?? null,
  partner_name: t.partnerName ?? null, link_id: t.linkId ?? null,
  invoice_id: t.invoiceId ?? null,
});

const txFieldsToDb = (p: Partial<Transaction>) => {
  const r: Record<string, any> = {};
  if (p.accountId !== undefined) r.account_id = p.accountId;
  if (p.type !== undefined) r.type = p.type;
  if (p.amount !== undefined) r.amount = p.amount;
  if (p.taxAmount !== undefined) r.tax_amount = p.taxAmount;
  if (p.category !== undefined) r.category = p.category;
  if (p.subcategory !== undefined) r.subcategory = p.subcategory;
  if (p.description !== undefined) r.description = p.description;
  if (p.date !== undefined) r.date = p.date;
  if (p.isSale !== undefined) r.is_sale = p.isSale;
  return r;
};

const invToDb = (i: Invoice, orgId: string) => ({
  id: i.id, organization_id: orgId, contact_name: i.contactName,
  contact_id: i.contactId ?? null, type: i.type, amount: i.amount,
  tax_amount: i.taxAmount ?? null, is_sale: i.isSale ?? false,
  category: i.category, issue_date: i.issueDate ?? new Date().toISOString().slice(0, 10),
  due_date: i.dueDate, status: i.status, notes: i.notes ?? null,
});

const invFieldsToDb = (p: Partial<Invoice>) => {
  const r: Record<string, any> = {};
  if (p.contactName !== undefined) r.contact_name = p.contactName;
  if (p.contactId !== undefined) r.contact_id = p.contactId;
  if (p.amount !== undefined) r.amount = p.amount;
  if (p.taxAmount !== undefined) r.tax_amount = p.taxAmount;
  if (p.isSale !== undefined) r.is_sale = p.isSale;
  if (p.category !== undefined) r.category = p.category;
  if (p.issueDate !== undefined) r.issue_date = p.issueDate;
  if (p.dueDate !== undefined) r.due_date = p.dueDate;
  if (p.notes !== undefined) r.notes = p.notes;
  return r;
};

const contactToDb = (c: Contact, orgId: string) => ({
  id: c.id, organization_id: orgId, name: c.name, kind: c.kind,
  phone: c.phone ?? null, email: c.email ?? null, nif: c.nif ?? null,
  location: c.location ?? null, payment_term: c.paymentTerm ?? null,
  role: c.role ?? null, notes: c.notes ?? null,
});

const contactFieldsToDb = (p: Partial<Contact>) => {
  const r: Record<string, any> = {};
  if (p.name !== undefined) r.name = p.name;
  if (p.kind !== undefined) r.kind = p.kind;
  if (p.phone !== undefined) r.phone = p.phone;
  if (p.email !== undefined) r.email = p.email;
  if (p.nif !== undefined) r.nif = p.nif;
  if (p.location !== undefined) r.location = p.location;
  if (p.paymentTerm !== undefined) r.payment_term = p.paymentTerm;
  if (p.role !== undefined) r.role = p.role;
  if (p.notes !== undefined) r.notes = p.notes;
  return r;
};

const reqToDb = (r: Requisition, orgId: string) => ({
  id: r.id, organization_id: orgId, number: r.number, requester: r.requester,
  approver: r.approver, department: r.department ?? null,
  items: r.items ?? [], amount: r.amount, date: r.date,
  purpose: r.purpose, category: r.category, status: r.status,
});

const reqFieldsToDb = (p: Partial<Requisition>) => {
  const r: Record<string, any> = {};
  if (p.requester !== undefined) r.requester = p.requester;
  if (p.approver !== undefined) r.approver = p.approver;
  if (p.department !== undefined) r.department = p.department;
  if (p.items !== undefined) { r.items = p.items; r.amount = p.items.reduce((s: number, it: any) => s + it.qty * it.unitPrice, 0); }
  if (p.amount !== undefined && !p.items) r.amount = p.amount;
  if (p.purpose !== undefined) r.purpose = p.purpose;
  if (p.category !== undefined) r.category = p.category;
  return r;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const defaultCompany: Company = {
  name: "", nif: "", regime: "geral", address: "", phone: "", email: undefined,
  commissions: { paysCommercial: false, members: [], paysClients: false, clientPercent: 0, clientNote: "" },
};

const defaultProfile: UserProfile = {
  name: "", phone: "", email: "", bi: "",
  plan: "Gratuito", renewal: "", xp: 0, level: 1, streak: 0,
  lastActive: new Date().toISOString().slice(0, 10),
};

// ---- Provider ----
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const orgIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const [company, setCompany] = useState<Company>(defaultCompany);
  const [rawAccounts, setRawAccounts] = useState<Omit<Account, "currentBalance">[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [badges, setBadges] = useState<Badge[]>(seedBadges);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => { orgIdRef.current = orgId; }, [orgId]);

  const accounts = useMemo<Account[]>(() =>
    rawAccounts.map(a => ({
      ...a,
      currentBalance: a.initialBalance + transactions
        .filter(t => t.accountId === a.id)
        .reduce((sum, t) => sum + txDelta(t), 0),
    })),
    [rawAccounts, transactions]
  );

  const sb = useCallback(() => createClient(), []);

  // ---- Auth & data loading ----
  const loadOrgData = useCallback(async (oid: string) => {
    const supabase = createClient();
    const [compRes, accRes, txRes, invRes, conRes, rqRes] = await Promise.all([
      supabase.from("companies").select("*").eq("organization_id", oid).single(),
      supabase.from("accounts").select("*").eq("organization_id", oid).order("created_at"),
      supabase.from("transactions").select("*").eq("organization_id", oid).order("date", { ascending: false }),
      supabase.from("invoices").select("*").eq("organization_id", oid).order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").eq("organization_id", oid).order("name"),
      supabase.from("requisitions").select("*").eq("organization_id", oid).order("created_at", { ascending: false }),
    ]);
    if (compRes.data) setCompany(dbToCompany(compRes.data));
    if (accRes.data) setRawAccounts(accRes.data.map(dbToAccount));
    if (txRes.data) setTransactions(txRes.data.map(dbToTransaction));
    if (invRes.data) setInvoices(invRes.data.map(dbToInvoice));
    if (conRes.data) setContacts(conRes.data.map(dbToContact));
    if (rqRes.data) setRequisitions(rqRes.data.map(dbToRequisition));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setAuthed(true);
        userIdRef.current = user.id;
        const { data: dbProfile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (dbProfile) {
          setProfile(p => ({ ...p, name: dbProfile.full_name || "", phone: dbProfile.phone || "", bi: dbProfile.bi || "", email: user.email || "" }));
          if (dbProfile.current_org_id) {
            setOrgId(dbProfile.current_org_id);
            await loadOrgData(dbProfile.current_org_id);
          }
        }
      }
      setReady(true);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
      if (!session?.user) {
        userIdRef.current = null;
        setOrgId(null);
        setRawAccounts([]); setTransactions([]); setInvoices([]);
        setContacts([]); setRequisitions([]); setCompany(defaultCompany);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadOrgData]);

  // Gamification: localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_GAME);
      if (raw) {
        const g = JSON.parse(raw);
        setProfile(p => ({ ...p, xp: g.xp ?? p.xp, streak: g.streak ?? p.streak, lastActive: g.lastActive ?? p.lastActive }));
        if (g.badges) setBadges(g.badges);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LS_GAME, JSON.stringify({ xp: profile.xp, streak: profile.streak, lastActive: profile.lastActive, badges }));
  }, [ready, profile.xp, profile.streak, profile.lastActive, badges]);

  // ---- Helpers ----
  const toast = useCallback((msg: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const gainXp = useCallback((amount: number, reason: string) => {
    setProfile(p => ({ ...p, xp: p.xp + amount }));
    toast(`+${amount} XP — ${reason}`, "xp");
  }, [toast]);

  // ---- Auth ----
  const logout = async () => { await sb().auth.signOut(); setAuthed(false); };

  const createOrganization = async (orgName: string, companyName: string, userName: string) => {
    const supabase = sb();
    const slug = slugify(orgName);
    const { data: newOrgId, error } = await supabase.rpc("create_organization", { p_name: orgName, p_slug: slug });
    if (error) throw new Error(error.message);
    await Promise.all([
      supabase.from("companies").update({ name: companyName }).eq("organization_id", newOrgId),
      supabase.from("profiles").update({ full_name: userName }).eq("id", userIdRef.current!),
    ]);
    setProfile(p => ({ ...p, name: userName }));
    setOrgId(newOrgId);
    setCompany(prev => ({ ...prev, name: companyName }));
  };

  // ---- Company ----
  const updateCompany: Store["updateCompany"] = (p) => {
    setCompany(c => ({ ...c, ...p }));
    toast("Dados da empresa atualizados", "ok");
    sb().from("companies").update(companyToDb(p)).eq("organization_id", orgIdRef.current!)
      .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  // ---- Accounts ----
  const addAccount: Store["addAccount"] = (a) => {
    const id = crypto.randomUUID();
    setRawAccounts(prev => [...prev, { ...a, id }]);
    gainXp(50, "Nova conta criada");
    sb().from("accounts").insert({ id, organization_id: orgIdRef.current!, name: a.name, type: a.type, bank: a.bank || null, initial_balance: a.initialBalance })
      .then(({ error }) => { if (error) { toast("Erro: " + error.message, "warn"); setRawAccounts(prev => prev.filter(x => x.id !== id)); } });
  };

  const editAccount: Store["editAccount"] = (id, p) => {
    setRawAccounts(prev => prev.map(a => a.id === id ? { ...a, ...p } : a));
    toast("Conta atualizada", "ok");
    sb().from("accounts").update({ name: p.name, type: p.type, bank: p.bank || null }).eq("id", id)
      .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  const deleteAccount: Store["deleteAccount"] = (id) => {
    if (transactions.some(t => t.accountId === id)) { toast("Não dá para apagar: a conta tem lançamentos.", "warn"); return; }
    setRawAccounts(prev => prev.filter(a => a.id !== id));
    toast("Conta apagada", "ok");
    sb().from("accounts").delete().eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  // ---- Transactions ----
  const addTransaction: Store["addTransaction"] = (t) => {
    const id = crypto.randomUUID();
    const tx: Transaction = { ...t, id };
    setTransactions(prev => [tx, ...prev]);
    gainXp(50, "Lançamento registado");
    sb().from("transactions").insert(txToDb(tx, orgIdRef.current!))
      .then(({ error }) => { if (error) { toast("Erro: " + error.message, "warn"); setTransactions(prev => prev.filter(x => x.id !== id)); } });
  };

  const editTransaction: Store["editTransaction"] = (id, p) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...p } : t));
    toast("Lançamento atualizado", "ok");
    sb().from("transactions").update(txFieldsToDb(p)).eq("id", id)
      .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  const deleteTransaction: Store["deleteTransaction"] = (id) => {
    setTransactions(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;
      const group = target.linkId ? prev.filter(t => t.linkId === target.linkId) : [target];
      const ids = new Set(group.map(t => t.id));
      if (target.linkId) {
        sb().from("transactions").delete().eq("link_id", target.linkId).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
      } else {
        sb().from("transactions").delete().eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
      }
      return prev.filter(t => !ids.has(t.id));
    });
    toast("Lançamento apagado", "ok");
  };

  const transfer: Store["transfer"] = (from, to, amount) => {
    const src = accounts.find(a => a.id === from);
    if (!src) return "Conta de origem inválida";
    if (from === to) return "As contas devem ser diferentes";
    if (src.currentBalance < amount) return "Saldo insuficiente";
    const linkId = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 10);
    setTransactions(prev => [
      { id: crypto.randomUUID(), accountId: from, type: "transfer_out", amount, category: "Transferência", description: "Transferência interna", date: now, linkId },
      { id: crypto.randomUUID(), accountId: to, type: "transfer_in", amount, category: "Transferência", description: "Transferência interna", date: now, linkId },
      ...prev,
    ]);
    toast("Transferência concluída", "ok");
    sb().rpc("transfer_funds", { p_from_account: from, p_to_account: to, p_amount: amount, p_org_id: orgIdRef.current! })
      .then(({ error }) => {
        if (error) { toast("Erro na transferência: " + error.message, "warn"); setTransactions(prev => prev.filter(t => t.linkId !== linkId)); }
        else { sb().from("transactions").select("*").eq("organization_id", orgIdRef.current!).order("date", { ascending: false }).then(({ data }) => { if (data) setTransactions(data.map(dbToTransaction)); }); }
      });
    return null;
  };

  // ---- Invoices ----
  const addInvoice: Store["addInvoice"] = (i) => {
    const id = crypto.randomUUID();
    const overdue = new Date(i.dueDate + "T00:00:00") < new Date(new Date().toDateString());
    const inv: Invoice = { ...i, id, status: overdue ? "overdue" : "pending" };
    setInvoices(prev => [inv, ...prev]);
    gainXp(50, "Fatura criada");
    sb().from("invoices").insert(invToDb(inv, orgIdRef.current!))
      .then(({ error }) => { if (error) { toast("Erro: " + error.message, "warn"); setInvoices(prev => prev.filter(x => x.id !== id)); } });
  };

  const editInvoice: Store["editInvoice"] = (id, p) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return "Fatura não encontrada";
    if (inv.status === "paid") return "Fatura paga não pode ser editada. Corrige o lançamento gerado em Transações.";
    setInvoices(prev => prev.map(i => {
      if (i.id !== id) return i;
      const merged = { ...i, ...p };
      const od = new Date(merged.dueDate + "T00:00:00") < new Date(new Date().toDateString());
      return { ...merged, status: od ? "overdue" : "pending" };
    }));
    toast("Fatura atualizada", "ok");
    sb().from("invoices").update(invFieldsToDb(p)).eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
    return null;
  };

  const deleteInvoice: Store["deleteInvoice"] = (id) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return "Fatura não encontrada";
    if (inv.status === "paid") return "Fatura paga não pode ser apagada. Apaga o lançamento em Transações.";
    setInvoices(prev => prev.filter(i => i.id !== id));
    toast("Fatura apagada", "ok");
    sb().from("invoices").delete().eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
    return null;
  };

  const markPaid: Store["markPaid"] = (invoiceId, accountId) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const wasOverdue = inv.status === "overdue";
    const isIncome = inv.type === "receivable";
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: "paid" as const, paidAt: new Date().toISOString(), accountId } : i));
    const tempTxId = crypto.randomUUID();
    setTransactions(prev => [{
      id: tempTxId, accountId, type: isIncome ? "income" as const : "expense" as const, amount: inv.amount,
      taxAmount: isIncome ? inv.taxAmount : undefined, isSale: isIncome ? inv.isSale : undefined,
      category: inv.category, description: `Fatura ${isIncome ? "recebida de" : "paga a"} ${inv.contactName}`,
      date: new Date().toISOString().slice(0, 10), invoiceId,
    }, ...prev]);
    gainXp(wasOverdue && isIncome ? 150 : 100, wasOverdue && isIncome ? "Fatura vencida cobrada!" : "Fatura liquidada");
    sb().rpc("mark_invoice_paid", { p_invoice_id: invoiceId, p_account_id: accountId, p_org_id: orgIdRef.current! })
      .then(({ error }) => {
        if (error) {
          toast("Erro: " + error.message, "warn");
          setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: (wasOverdue ? "overdue" : "pending") as Invoice["status"], paidAt: undefined, accountId: undefined } : i));
          setTransactions(prev => prev.filter(t => t.id !== tempTxId));
        } else {
          Promise.all([
            sb().from("transactions").select("*").eq("organization_id", orgIdRef.current!).order("date", { ascending: false }),
            sb().from("invoices").select("*").eq("organization_id", orgIdRef.current!).order("created_at", { ascending: false }),
          ]).then(([txR, invR]) => { if (txR.data) setTransactions(txR.data.map(dbToTransaction)); if (invR.data) setInvoices(invR.data.map(dbToInvoice)); });
        }
      });
    if (wasOverdue && isIncome) {
      setBadges(prev => {
        const b4 = prev.find(b => b.id === "b4");
        if (b4 && !b4.unlocked) {
          toast("Conquista desbloqueada: Caçador de Dívidas (+250 XP)", "xp");
          setProfile(p => ({ ...p, xp: p.xp + 250 }));
          return prev.map(b => b.id === "b4" ? { ...b, unlocked: true } : b);
        }
        return prev;
      });
    }
  };

  // ---- Contacts ----
  const addContact: Store["addContact"] = (c) => {
    const id = crypto.randomUUID();
    setContacts(prev => [{ ...c, id }, ...prev]);
    toast("Contacto guardado", "ok");
    sb().from("contacts").insert(contactToDb({ ...c, id }, orgIdRef.current!))
      .then(({ error }) => { if (error) { toast("Erro: " + error.message, "warn"); setContacts(prev => prev.filter(x => x.id !== id)); } });
  };

  const editContact: Store["editContact"] = (id, p) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...p } : c));
    toast("Contacto atualizado", "ok");
    sb().from("contacts").update(contactFieldsToDb(p)).eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  const removeContact: Store["removeContact"] = (id) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    toast("Contacto removido", "ok");
    sb().from("contacts").delete().eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  // ---- Requisitions ----
  const addRequisition: Store["addRequisition"] = (r) => {
    const id = crypto.randomUUID();
    const now = new Date();
    const n = requisitions.length + 1;
    const number = `RQ-${String(n).padStart(3, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const amount = r.items && r.items.length ? r.items.reduce((s: number, it) => s + it.qty * it.unitPrice, 0) : r.amount;
    const req: Requisition = { ...r, amount, id, number, status: "pendente" };
    setRequisitions(prev => [req, ...prev]);
    toast(`Requisição ${number} criada`, "ok");
    gainXp(30, "Requisição emitida");
    sb().from("requisitions").insert(reqToDb(req, orgIdRef.current!))
      .then(({ error }) => { if (error) { toast("Erro: " + error.message, "warn"); setRequisitions(prev => prev.filter(x => x.id !== id)); } });
  };

  const editRequisition: Store["editRequisition"] = (id, p) => {
    const req = requisitions.find(r => r.id === id);
    if (!req) return "Requisição não encontrada";
    if (req.status !== "pendente") return "Só requisições pendentes podem ser editadas.";
    setRequisitions(prev => prev.map(r => {
      if (r.id !== id) return r;
      const merged = { ...r, ...p };
      if (merged.items && merged.items.length) merged.amount = merged.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      return merged;
    }));
    toast("Requisição atualizada", "ok");
    sb().from("requisitions").update(reqFieldsToDb(p)).eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
    return null;
  };

  const deleteRequisition: Store["deleteRequisition"] = (id) => {
    const req = requisitions.find(r => r.id === id);
    if (!req) return "Requisição não encontrada";
    if (req.status === "aprovado") return "Requisição aprovada não pode ser apagada (já gerou saída e serve para impressão).";
    setRequisitions(prev => prev.filter(r => r.id !== id));
    toast("Requisição apagada", "ok");
    sb().from("requisitions").delete().eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
    return null;
  };

  const approveRequisition: Store["approveRequisition"] = (id, accountId) => {
    const req = requisitions.find(r => r.id === id);
    if (!req) return;
    setRequisitions(prev => prev.map(r => r.id === id ? { ...r, status: "aprovado" as const, accountId, decidedAt: new Date().toISOString() } : r));
    const tempTxId = crypto.randomUUID();
    setTransactions(prev => [{
      id: tempTxId, accountId, type: "expense" as const, amount: req.amount, category: req.category,
      description: `Requisição ${req.number} — ${req.purpose.slice(0, 40)}`, date: new Date().toISOString().slice(0, 10),
    }, ...prev]);
    toast(`${req.number} aprovada — saída lançada`, "ok");
    gainXp(50, "Requisição aprovada");
    sb().rpc("approve_requisition", { p_req_id: id, p_account_id: accountId, p_org_id: orgIdRef.current! })
      .then(({ error }) => {
        if (error) {
          toast("Erro: " + error.message, "warn");
          setRequisitions(prev => prev.map(r => r.id === id ? { ...r, status: "pendente" as const, accountId: undefined, decidedAt: undefined } : r));
          setTransactions(prev => prev.filter(t => t.id !== tempTxId));
        } else {
          Promise.all([
            sb().from("transactions").select("*").eq("organization_id", orgIdRef.current!).order("date", { ascending: false }),
            sb().from("requisitions").select("*").eq("organization_id", orgIdRef.current!).order("created_at", { ascending: false }),
          ]).then(([txR, rqR]) => { if (txR.data) setTransactions(txR.data.map(dbToTransaction)); if (rqR.data) setRequisitions(rqR.data.map(dbToRequisition)); });
        }
      });
  };

  const rejectRequisition: Store["rejectRequisition"] = (id, reason) => {
    setRequisitions(prev => prev.map(r => r.id === id ? { ...r, status: "reprovado" as const, reason, decidedAt: new Date().toISOString() } : r));
    toast("Requisição reprovada", "warn");
    sb().from("requisitions").update({ status: "reprovado", reason, decided_at: new Date().toISOString() }).eq("id", id)
      .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  // ---- Capital ----
  const addCapital: Store["addCapital"] = (d) => {
    const acc = accounts.find(a => a.id === d.accountId);
    if (!acc) return "Conta inválida";
    if (d.kind === "retirada") {
      if (acc.currentBalance < d.amount) return "Saldo insuficiente na conta";
      const contributed = transactions.filter(t => t.partnerId === d.partnerId && t.type === "capital_in").reduce((s, t) => s + t.amount, 0);
      const withdrawn = transactions.filter(t => t.partnerId === d.partnerId && t.type === "capital_out").reduce((s, t) => s + t.amount, 0);
      if (contributed - withdrawn < d.amount) return `O sócio só tem ${(contributed - withdrawn).toLocaleString("pt-AO")} Kz de capital disponível`;
    }
    const id = crypto.randomUUID();
    const tx: Transaction = {
      id, accountId: d.accountId, type: d.kind === "aporte" ? "capital_in" : "capital_out",
      amount: d.amount, partnerId: d.partnerId, partnerName: d.partnerName, category: "Capital",
      description: d.description || (d.kind === "aporte" ? "Aporte de capital" : "Retirada de capital"), date: d.date,
    };
    setTransactions(prev => [tx, ...prev]);
    toast(d.kind === "aporte" ? "Aporte registado" : "Retirada registada", "ok");
    gainXp(40, d.kind === "aporte" ? "Aporte de sócio" : "Retirada de sócio");
    sb().from("transactions").insert(txToDb(tx, orgIdRef.current!))
      .then(({ error }) => { if (error) { toast("Erro: " + error.message, "warn"); setTransactions(prev => prev.filter(t => t.id !== id)); } });
    return null;
  };

  // ---- Profile ----
  const updateProfile: Store["updateProfile"] = (p) => {
    setProfile(prev => ({ ...prev, ...p }));
    toast("Perfil atualizado com sucesso!", "ok");
    const dbFields: Record<string, string | undefined> = {};
    if (p.name !== undefined) dbFields.full_name = p.name;
    if (p.phone !== undefined) dbFields.phone = p.phone;
    if (p.bi !== undefined) dbFields.bi = p.bi;
    if (Object.keys(dbFields).length > 0) {
      sb().from("profiles").update(dbFields).eq("id", userIdRef.current!)
        .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
    }
  };

  return (
    <Ctx.Provider value={{
      ready, authed, orgId, logout, createOrganization,
      company, accounts, transactions, invoices, contacts, requisitions, badges, profile, toasts,
      updateCompany, addAccount, editAccount, deleteAccount,
      addTransaction, editTransaction, deleteTransaction, transfer,
      addInvoice, editInvoice, deleteInvoice, markPaid,
      addContact, editContact, removeContact,
      addRequisition, editRequisition, deleteRequisition, approveRequisition, rejectRequisition,
      addCapital, updateProfile, gainXp,
      taxRate: taxRateFor(company.regime),
    }}>
      {children}
    </Ctx.Provider>
  );
}
