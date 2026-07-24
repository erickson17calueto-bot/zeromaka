"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "./supabase/client";
import {
  Account, Transaction, TxType, Invoice, Badge, UserProfile, Company, Contact, Requisition,
  JournalEntry, JournalLine, FinancialCategory,
  seedBadges, taxRateFor
} from "./data";

interface Toast { id: number; msg: string; kind: "ok" | "xp" | "warn" }

interface Store {
  ready: boolean; authed: boolean; orgId: string | null;
  logout: () => Promise<void>;
  createOrganization: (orgName: string, companyName: string, userName: string) => Promise<void>;
  company: Company; accounts: Account[]; transactions: Transaction[]; invoices: Invoice[];
  contacts: Contact[]; requisitions: Requisition[]; badges: Badge[]; profile: UserProfile; toasts: Toast[];
  journalEntries: JournalEntry[]; categories: FinancialCategory[];
  updateCompany: (p: Partial<Company>) => void;
  addAccount: (a: Omit<Account, "id" | "currentBalance">) => void;
  editAccount: (id: string, p: Partial<Pick<Account, "name" | "type" | "bank">>) => void;
  deleteAccount: (id: string) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  editTransaction: (id: string, p: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  transfer: (from: string, to: string, amount: number) => string | null;
  reverseEntry: (entryId: string, reason: string) => void;
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
  isArchived: r.is_archived || false, currency: r.currency || "AOA",
});

const dbToJournalLine = (r: any): JournalLine => ({
  id: r.id, accountId: r.account_id, direction: r.direction, amount: Number(r.amount),
});

const dbToJournalEntry = (r: any): JournalEntry => ({
  id: r.id, entryNumber: r.entry_number, entryType: r.entry_type,
  transactionDate: r.transaction_date, description: r.description,
  reference: r.reference || undefined,
  contactId: r.contact_id || undefined, categoryId: r.category_id || undefined,
  categoryName: r.financial_categories?.name || undefined,
  status: r.status, source: r.source,
  createdAt: r.created_at, postedAt: r.posted_at,
  reversedAt: r.reversed_at || undefined,
  reversedByEntryId: r.reversed_by_entry_id || undefined,
  reversesEntryId: r.reverses_entry_id || undefined,
  reversalReason: r.reversal_reason || undefined,
  metadata: r.metadata || {},
  lines: (r.journal_lines || []).map(dbToJournalLine),
});

const dbToCategory = (r: any): FinancialCategory => ({
  id: r.id, organizationId: r.organization_id, name: r.name,
  categoryType: r.category_type, parentId: r.parent_id || undefined,
  isSystem: r.is_system, isActive: r.is_active,
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

// ---- Journal → backward-compatible Transaction mapper ----
function entryToTransactions(entry: JournalEntry): Transaction[] {
  if (entry.status === "reversed") return [];
  if (entry.entryType === "opening_balance" || entry.entryType === "reversal" || entry.entryType === "adjustment") return [];

  const meta = entry.metadata || {};

  if (entry.entryType === "transfer") {
    const creditLine = entry.lines.find(l => l.direction === "credit");
    const debitLine = entry.lines.find(l => l.direction === "debit");
    if (!creditLine || !debitLine) return [];
    return [
      { id: entry.id + "_out", accountId: creditLine.accountId, type: "transfer_out" as TxType, amount: creditLine.amount, category: "Transferência", description: entry.description, date: entry.transactionDate, linkId: entry.id },
      { id: entry.id + "_in", accountId: debitLine.accountId, type: "transfer_in" as TxType, amount: debitLine.amount, category: "Transferência", description: entry.description, date: entry.transactionDate, linkId: entry.id },
    ];
  }

  const line = entry.lines[0];
  if (!line) return [];

  let txType: TxType;
  if (meta.type === "capital_in") txType = "capital_in";
  else if (meta.type === "capital_out") txType = "capital_out";
  else if (entry.entryType === "income") txType = "income";
  else txType = "expense";

  return [{
    id: entry.id, accountId: line.accountId, type: txType, amount: line.amount,
    category: entry.categoryName || (meta.category as string) || "",
    subcategory: meta.subcategory as string | undefined,
    description: entry.description, date: entry.transactionDate,
    partnerId: meta.partnerId as string | undefined,
    partnerName: meta.partnerName as string | undefined,
    isSale: meta.is_sale as boolean | undefined,
    taxAmount: typeof meta.tax_amount === "number" ? meta.tax_amount : undefined,
    invoiceId: meta.invoice_id as string | undefined,
  }];
}

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
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [badges, setBadges] = useState<Badge[]>(seedBadges);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => { orgIdRef.current = orgId; }, [orgId]);

  // Balance derived from journal lines (debit increases, credit decreases)
  const accounts = useMemo<Account[]>(() =>
    rawAccounts.map(a => {
      const balance = journalEntries
        .flatMap(e => e.lines)
        .filter(l => l.accountId === a.id)
        .reduce((sum, l) => sum + (l.direction === "debit" ? l.amount : -l.amount), 0);
      return { ...a, currentBalance: balance };
    }),
    [rawAccounts, journalEntries]
  );

  // Backward-compatible transactions derived from journal entries
  const transactions = useMemo<Transaction[]>(() =>
    journalEntries.flatMap(entryToTransactions),
    [journalEntries]
  );

  const sb = useCallback(() => createClient(), []);

  // ---- Refresh helpers ----
  const refreshEntries = useCallback(async (oid?: string) => {
    const supabase = createClient();
    const id = oid || orgIdRef.current;
    if (!id) return;
    const { data } = await supabase
      .from("journal_entries")
      .select("*, journal_lines(*), financial_categories(name)")
      .eq("organization_id", id)
      .order("transaction_date", { ascending: false });
    if (data) setJournalEntries(data.map(dbToJournalEntry));
  }, []);

  // ---- Auth & data loading ----
  const loadOrgData = useCallback(async (oid: string) => {
    const supabase = createClient();
    const [compRes, accRes, entryRes, catRes, invRes, conRes, rqRes] = await Promise.all([
      supabase.from("companies").select("*").eq("organization_id", oid).single(),
      supabase.from("accounts").select("*").eq("organization_id", oid).eq("is_archived", false).order("created_at"),
      supabase.from("journal_entries").select("*, journal_lines(*), financial_categories(name)").eq("organization_id", oid).order("transaction_date", { ascending: false }),
      supabase.from("financial_categories").select("*").eq("organization_id", oid).eq("is_active", true).order("name"),
      supabase.from("invoices").select("*").eq("organization_id", oid).order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").eq("organization_id", oid).order("name"),
      supabase.from("requisitions").select("*").eq("organization_id", oid).order("created_at", { ascending: false }),
    ]);
    if (compRes.data) setCompany(dbToCompany(compRes.data));
    if (accRes.data) setRawAccounts(accRes.data.map(dbToAccount));
    if (entryRes.data) setJournalEntries(entryRes.data.map(dbToJournalEntry));
    if (catRes.data) setCategories(catRes.data.map(dbToCategory));
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
        setRawAccounts([]); setJournalEntries([]); setCategories([]);
        setInvoices([]); setContacts([]); setRequisitions([]); setCompany(defaultCompany);
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
      supabase.rpc("seed_default_categories", { p_org_id: newOrgId }),
    ]);
    setProfile(p => ({ ...p, name: userName }));
    setOrgId(newOrgId);
    setCompany(prev => ({ ...prev, name: companyName }));
    // Load categories that were just seeded
    const { data: cats } = await supabase.from("financial_categories").select("*").eq("organization_id", newOrgId).eq("is_active", true).order("name");
    if (cats) setCategories(cats.map(dbToCategory));
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
    setRawAccounts(prev => [...prev, { ...a, id, isArchived: false, currency: "AOA" }]);
    gainXp(50, "Nova conta criada");
    sb().rpc("create_account_with_balance", {
      p_org_id: orgIdRef.current!, p_id: id,
      p_name: a.name, p_type: a.type, p_bank: a.bank || null,
      p_initial_balance: a.initialBalance,
    }).then(({ error }) => {
      if (error) {
        toast("Erro: " + error.message, "warn");
        setRawAccounts(prev => prev.filter(x => x.id !== id));
      } else {
        refreshEntries();
      }
    });
  };

  const editAccount: Store["editAccount"] = (id, p) => {
    setRawAccounts(prev => prev.map(a => a.id === id ? { ...a, ...p } : a));
    toast("Conta atualizada", "ok");
    sb().from("accounts").update({ name: p.name, type: p.type, bank: p.bank || null }).eq("id", id)
      .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  const deleteAccount: Store["deleteAccount"] = (id) => {
    const hasMovements = journalEntries.some(e => e.status === "posted" && e.lines.some(l => l.accountId === id));
    if (hasMovements) {
      setRawAccounts(prev => prev.filter(a => a.id !== id));
      toast("Conta arquivada (tem lançamentos)", "ok");
      sb().from("accounts").update({ is_archived: true }).eq("id", id)
        .then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
      return;
    }
    setRawAccounts(prev => prev.filter(a => a.id !== id));
    toast("Conta apagada", "ok");
    sb().from("accounts").delete().eq("id", id).then(({ error }) => { if (error) toast("Erro: " + error.message, "warn"); });
  };

  // ---- Financial Mutations (Journal-based) ----
  const addTransaction: Store["addTransaction"] = (t) => {
    const isIncome = t.type === "income" || t.type === "capital_in";
    const rpcName = isIncome ? "post_income" : "post_expense";
    const catType = isIncome ? "income" : "expense";
    const cat = categories.find(c => c.name === t.category && c.categoryType === catType);

    const metadata: Record<string, unknown> = {};
    if (t.subcategory) metadata.subcategory = t.subcategory;
    if (t.isSale) metadata.is_sale = t.isSale;
    if (t.taxAmount) metadata.tax_amount = t.taxAmount;
    if (t.type === "capital_in") metadata.type = "capital_in";
    if (t.type === "capital_out") metadata.type = "capital_out";
    if (t.partnerId) metadata.partnerId = t.partnerId;
    if (t.partnerName) metadata.partnerName = t.partnerName;
    if (t.category) metadata.category = t.category;

    // Optimistic entry
    const tempId = crypto.randomUUID();
    const tempEntry: JournalEntry = {
      id: tempId, entryNumber: "...", entryType: isIncome ? "income" : "expense",
      transactionDate: t.date, description: t.description,
      categoryId: cat?.id, categoryName: cat?.name || t.category,
      contactId: t.partnerId, status: "posted", source: "manual",
      createdAt: new Date().toISOString(), postedAt: new Date().toISOString(),
      metadata,
      lines: [{ id: "temp", accountId: t.accountId, direction: isIncome ? "debit" : "credit", amount: t.amount }],
    };
    setJournalEntries(prev => [tempEntry, ...prev]);
    gainXp(50, "Lançamento registado");

    sb().rpc(rpcName, {
      p_org_id: orgIdRef.current!, p_account_id: t.accountId,
      p_amount: t.amount, p_description: t.description, p_date: t.date,
      p_category_id: cat?.id || null, p_contact_id: t.partnerId || null,
      p_metadata: metadata,
    }).then(({ data, error }) => {
      if (error) {
        toast("Erro: " + error.message, "warn");
        setJournalEntries(prev => prev.filter(e => e.id !== tempId));
      } else {
        refreshEntries();
      }
    });
  };

  const editTransaction: Store["editTransaction"] = (_id, _p) => {
    toast("Lançamentos confirmados não podem ser editados. Reverta e crie um novo.", "warn");
  };

  const deleteTransaction: Store["deleteTransaction"] = (id) => {
    // Map old transaction ID to journal entry and reverse it
    const cleanId = id.endsWith("_out") ? id.replace(/_out$/, "") : id.endsWith("_in") ? id.replace(/_in$/, "") : id;
    const entry = journalEntries.find(e => e.id === cleanId);
    if (!entry) { toast("Movimento não encontrado", "warn"); return; }
    if (entry.status === "reversed") { toast("Este movimento já foi revertido", "warn"); return; }
    reverseEntry(cleanId, "Apagado pelo utilizador");
  };

  const transfer: Store["transfer"] = (from, to, amount) => {
    const src = accounts.find(a => a.id === from);
    if (!src) return "Conta de origem inválida";
    if (from === to) return "As contas devem ser diferentes";
    if (src.currentBalance < amount) return "Saldo insuficiente";

    // Optimistic entry
    const tempId = crypto.randomUUID();
    const tempEntry: JournalEntry = {
      id: tempId, entryNumber: "...", entryType: "transfer",
      transactionDate: new Date().toISOString().slice(0, 10),
      description: "Transferência interna", status: "posted", source: "manual",
      createdAt: new Date().toISOString(), postedAt: new Date().toISOString(),
      metadata: {},
      lines: [
        { id: "t1", accountId: from, direction: "credit", amount },
        { id: "t2", accountId: to, direction: "debit", amount },
      ],
    };
    setJournalEntries(prev => [tempEntry, ...prev]);
    toast("Transferência concluída", "ok");

    sb().rpc("post_transfer", {
      p_org_id: orgIdRef.current!, p_from_account_id: from,
      p_to_account_id: to, p_amount: amount,
    }).then(({ error }) => {
      if (error) {
        toast("Erro na transferência: " + error.message, "warn");
        setJournalEntries(prev => prev.filter(e => e.id !== tempId));
      } else {
        refreshEntries();
      }
    });
    return null;
  };

  const reverseEntry: Store["reverseEntry"] = (entryId, reason) => {
    const entry = journalEntries.find(e => e.id === entryId);
    if (!entry) { toast("Movimento não encontrado", "warn"); return; }
    if (entry.status === "reversed") { toast("Este movimento já foi revertido", "warn"); return; }

    // Optimistic: mark as reversed
    setJournalEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: "reversed" as const, reversedAt: new Date().toISOString() } : e));
    toast("Movimento revertido", "ok");

    sb().rpc("reverse_journal_entry", { p_entry_id: entryId, p_reason: reason })
      .then(({ error }) => {
        if (error) {
          toast("Erro na reversão: " + error.message, "warn");
          setJournalEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: "posted" as const, reversedAt: undefined } : e));
        } else {
          refreshEntries();
        }
      });
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
    if (inv.status === "paid") return "Fatura paga não pode ser editada.";
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
    if (inv.status === "paid") return "Fatura paga não pode ser apagada.";
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
    gainXp(wasOverdue && isIncome ? 150 : 100, wasOverdue && isIncome ? "Fatura vencida cobrada!" : "Fatura liquidada");

    sb().rpc("mark_invoice_paid", { p_invoice_id: invoiceId, p_account_id: accountId, p_org_id: orgIdRef.current! })
      .then(({ error }) => {
        if (error) {
          toast("Erro: " + error.message, "warn");
          setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: (wasOverdue ? "overdue" : "pending") as Invoice["status"], paidAt: undefined, accountId: undefined } : i));
        } else {
          Promise.all([
            refreshEntries(),
            sb().from("invoices").select("*").eq("organization_id", orgIdRef.current!).order("created_at", { ascending: false }),
          ]).then(([, invR]) => { if (invR.data) setInvoices(invR.data.map(dbToInvoice)); });
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
    toast(`${req.number} aprovada — saída lançada`, "ok");
    gainXp(50, "Requisição aprovada");

    sb().rpc("approve_requisition", { p_req_id: id, p_account_id: accountId, p_org_id: orgIdRef.current! })
      .then(({ error }) => {
        if (error) {
          toast("Erro: " + error.message, "warn");
          setRequisitions(prev => prev.map(r => r.id === id ? { ...r, status: "pendente" as const, accountId: undefined, decidedAt: undefined } : r));
        } else {
          Promise.all([
            refreshEntries(),
            sb().from("requisitions").select("*").eq("organization_id", orgIdRef.current!).order("created_at", { ascending: false }),
          ]).then(([, rqR]) => { if (rqR.data) setRequisitions(rqR.data.map(dbToRequisition)); });
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
    const isAporte = d.kind === "aporte";
    const rpcName = isAporte ? "post_income" : "post_expense";
    const metadata = {
      type: isAporte ? "capital_in" : "capital_out",
      partnerId: d.partnerId, partnerName: d.partnerName,
      category: "Capital",
    };

    // Optimistic entry
    const tempId = crypto.randomUUID();
    const tempEntry: JournalEntry = {
      id: tempId, entryNumber: "...", entryType: isAporte ? "income" : "expense",
      transactionDate: d.date, description: d.description || (isAporte ? "Aporte de capital" : "Retirada de capital"),
      status: "posted", source: "manual",
      createdAt: new Date().toISOString(), postedAt: new Date().toISOString(),
      metadata,
      lines: [{ id: "temp", accountId: d.accountId, direction: isAporte ? "debit" : "credit", amount: d.amount }],
    };
    setJournalEntries(prev => [tempEntry, ...prev]);
    toast(isAporte ? "Aporte registado" : "Retirada registada", "ok");
    gainXp(40, isAporte ? "Aporte de sócio" : "Retirada de sócio");

    sb().rpc(rpcName, {
      p_org_id: orgIdRef.current!, p_account_id: d.accountId,
      p_amount: d.amount, p_description: d.description || (isAporte ? "Aporte de capital" : "Retirada de capital"),
      p_date: d.date, p_metadata: metadata,
    }).then(({ error }) => {
      if (error) {
        toast("Erro: " + error.message, "warn");
        setJournalEntries(prev => prev.filter(e => e.id !== tempId));
      } else {
        refreshEntries();
      }
    });
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
      journalEntries, categories,
      updateCompany, addAccount, editAccount, deleteAccount,
      addTransaction, editTransaction, deleteTransaction, transfer, reverseEntry,
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
