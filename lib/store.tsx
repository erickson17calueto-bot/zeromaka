"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  Account, Transaction, Invoice, Badge, UserProfile, Company, Contact, Requisition,
  seedAccounts, seedTransactions, seedInvoices, seedBadges, seedProfile, seedCompany, seedContacts, seedRequisitions,
  taxRateFor, taxIncluded
} from "./data";

interface Toast { id: number; msg: string; kind: "ok" | "xp" | "warn" }

interface Store {
  ready: boolean; authed: boolean;
  login: (email: string) => void; logout: () => void;
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
const LS = "zeromaka_v3";

const txDelta = (t: Transaction) =>
  (t.type === "income" || t.type === "transfer_in" || t.type === "capital_in") ? t.amount : -t.amount;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [company, setCompany] = useState<Company>(seedCompany);
  const [accounts, setAccounts] = useState<Account[]>(seedAccounts);
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions);
  const [invoices, setInvoices] = useState<Invoice[]>(seedInvoices);
  const [contacts, setContacts] = useState<Contact[]>(seedContacts);
  const [requisitions, setRequisitions] = useState<Requisition[]>(seedRequisitions);
  const [badges, setBadges] = useState<Badge[]>(seedBadges);
  const [profile, setProfile] = useState<UserProfile>(seedProfile);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.company) setCompany({ ...seedCompany, ...s.company, commissions: { ...seedCompany.commissions, ...(s.company.commissions || {}) } });
        if (s.accounts) setAccounts(s.accounts);
        if (s.transactions) setTransactions(s.transactions);
        if (s.invoices) setInvoices(s.invoices);
        if (s.contacts) setContacts(s.contacts);
        if (s.requisitions) setRequisitions(s.requisitions);
        if (s.badges) setBadges(s.badges);
        if (s.profile) setProfile(s.profile);
        if (s.authed) setAuthed(true);
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LS, JSON.stringify({ company, accounts, transactions, invoices, contacts, requisitions, badges, profile, authed }));
  }, [ready, company, accounts, transactions, invoices, contacts, requisitions, badges, profile, authed]);

  const toast = useCallback((msg: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const gainXp = useCallback((amount: number, reason: string) => {
    setProfile((p) => ({ ...p, xp: p.xp + amount }));
    toast(`+${amount} XP — ${reason}`, "xp");
  }, [toast]);

  const login = (email: string) => { setAuthed(true); setProfile((p) => ({ ...p, email: email || p.email })); };
  const logout = () => setAuthed(false);
  const updateCompany: Store["updateCompany"] = (p) => { setCompany((c) => ({ ...c, ...p })); toast("Dados da empresa atualizados", "ok"); };

  const applyToBalance = (accountId: string, delta: number) =>
    setAccounts((prev) => prev.map((a) => a.id === accountId ? { ...a, currentBalance: a.currentBalance + delta } : a));

  // ---- Contas ----
  const addAccount: Store["addAccount"] = (a) => {
    setAccounts((prev) => [...prev, { ...a, id: "a" + Date.now(), currentBalance: a.initialBalance }]);
    gainXp(50, "Nova conta criada");
  };
  const editAccount: Store["editAccount"] = (id, p) => {
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, ...p } : a));
    toast("Conta atualizada", "ok");
  };
  const deleteAccount: Store["deleteAccount"] = (id) => {
    if (transactions.some((t) => t.accountId === id)) { toast("Não dá para apagar: a conta tem lançamentos. Apaga-os primeiro.", "warn"); return; }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    toast("Conta apagada", "ok");
  };

  // ---- Transações ----
  const addTransaction: Store["addTransaction"] = (t) => {
    const tx = { ...t, id: "t" + Date.now() };
    setTransactions((prev) => [tx, ...prev]);
    applyToBalance(t.accountId, txDelta(tx));
    gainXp(50, "Lançamento registado");
  };
  const editTransaction: Store["editTransaction"] = (id, p) => {
    setTransactions((prev) => {
      const old = prev.find((t) => t.id === id);
      if (!old) return prev;
      const updated = { ...old, ...p };
      applyToBalance(old.accountId, -txDelta(old));
      applyToBalance(updated.accountId, txDelta(updated));
      return prev.map((t) => t.id === id ? updated : t);
    });
    toast("Lançamento atualizado", "ok");
  };
  const deleteTransaction: Store["deleteTransaction"] = (id) => {
    setTransactions((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;
      const group = target.linkId ? prev.filter((t) => t.linkId === target.linkId) : [target];
      group.forEach((t) => applyToBalance(t.accountId, -txDelta(t)));
      const ids = new Set(group.map((t) => t.id));
      return prev.filter((t) => !ids.has(t.id));
    });
    toast("Lançamento apagado", "ok");
  };

  const transfer: Store["transfer"] = (from, to, amount) => {
    const src = accounts.find((a) => a.id === from);
    if (!src) return "Conta de origem inválida";
    if (from === to) return "As contas devem ser diferentes";
    if (src.currentBalance < amount) return "Saldo insuficiente";
    const now = new Date().toISOString().slice(0, 10);
    const link = "lk" + Date.now();
    setTransactions((prev) => [
      { id: "t" + Date.now() + "o", accountId: from, type: "transfer_out", amount, category: "Transferência", description: "Transferência interna", date: now, linkId: link },
      { id: "t" + Date.now() + "i", accountId: to, type: "transfer_in", amount, category: "Transferência", description: "Transferência interna", date: now, linkId: link },
      ...prev
    ]);
    applyToBalance(from, -amount); applyToBalance(to, amount);
    toast("Transferência concluída", "ok");
    return null;
  };

  // ---- Faturas ----
  const addInvoice: Store["addInvoice"] = (i) => {
    const overdue = new Date(i.dueDate + "T00:00:00") < new Date(new Date().toDateString());
    setInvoices((prev) => [{ ...i, id: "i" + Date.now(), status: overdue ? "overdue" : "pending" }, ...prev]);
    gainXp(50, "Fatura criada");
  };
  const editInvoice: Store["editInvoice"] = (id, p) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return "Fatura não encontrada";
    if (inv.status === "paid") return "Fatura paga não pode ser editada. Corrige o lançamento gerado em Transações.";
    setInvoices((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const merged = { ...i, ...p };
      const overdue = new Date(merged.dueDate + "T00:00:00") < new Date(new Date().toDateString());
      return { ...merged, status: overdue ? "overdue" : "pending" };
    }));
    toast("Fatura atualizada", "ok");
    return null;
  };
  const deleteInvoice: Store["deleteInvoice"] = (id) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return "Fatura não encontrada";
    if (inv.status === "paid") return "Fatura paga não pode ser apagada. Apaga o lançamento em Transações.";
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    toast("Fatura apagada", "ok");
    return null;
  };

  const markPaid: Store["markPaid"] = (invoiceId, accountId) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const wasOverdue = inv.status === "overdue";
    const isIncome = inv.type === "receivable";
    setInvoices((prev) => prev.map((i) => i.id === invoiceId ? { ...i, status: "paid", paidAt: new Date().toISOString(), accountId } : i));
    setTransactions((prev) => [{
      id: "t" + Date.now(), accountId, type: isIncome ? "income" : "expense", amount: inv.amount,
      taxAmount: isIncome ? inv.taxAmount : undefined, isSale: isIncome ? inv.isSale : undefined, invoiceId: inv.id,
      category: inv.category, description: `Fatura ${isIncome ? "recebida de" : "paga a"} ${inv.contactName}`,
      date: new Date().toISOString().slice(0, 10)
    }, ...prev]);
    applyToBalance(accountId, isIncome ? inv.amount : -inv.amount);
    gainXp(wasOverdue && isIncome ? 150 : 100, wasOverdue && isIncome ? "Fatura vencida cobrada!" : "Fatura liquidada");
    if (wasOverdue && isIncome) {
      setBadges((prev) => {
        const b4 = prev.find((b) => b.id === "b4");
        if (b4 && !b4.unlocked) {
          toast("Conquista desbloqueada: Caçador de Dívidas (+250 XP)", "xp");
          setProfile((p) => ({ ...p, xp: p.xp + 250 }));
          return prev.map((b) => b.id === "b4" ? { ...b, unlocked: true } : b);
        }
        return prev;
      });
    }
  };

  // ---- Contactos ----
  const addContact: Store["addContact"] = (c) => { setContacts((prev) => [{ ...c, id: "c" + Date.now() }, ...prev]); toast("Contacto guardado", "ok"); };
  const editContact: Store["editContact"] = (id, p) => { setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...p } : c)); toast("Contacto atualizado", "ok"); };
  const removeContact: Store["removeContact"] = (id) => { setContacts((prev) => prev.filter((c) => c.id !== id)); toast("Contacto removido", "ok"); };

  // ---- Requisições ----
  const addRequisition: Store["addRequisition"] = (r) => {
    const now = new Date();
    const n = requisitions.length + 1;
    const number = `RQ-${String(n).padStart(3, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const amount = r.items && r.items.length ? r.items.reduce((s, it) => s + it.qty * it.unitPrice, 0) : r.amount;
    setRequisitions((prev) => [{ ...r, amount, id: "r" + Date.now(), number, status: "pendente" }, ...prev]);
    toast(`Requisição ${number} criada`, "ok");
    gainXp(30, "Requisição emitida");
  };
  const editRequisition: Store["editRequisition"] = (id, p) => {
    const req = requisitions.find((r) => r.id === id);
    if (!req) return "Requisição não encontrada";
    if (req.status !== "pendente") return "Só requisições pendentes podem ser editadas.";
    setRequisitions((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...p };
      if (merged.items && merged.items.length) merged.amount = merged.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      return merged;
    }));
    toast("Requisição atualizada", "ok");
    return null;
  };
  const deleteRequisition: Store["deleteRequisition"] = (id) => {
    const req = requisitions.find((r) => r.id === id);
    if (!req) return "Requisição não encontrada";
    if (req.status === "aprovado") return "Requisição aprovada não pode ser apagada (já gerou saída e serve para impressão).";
    setRequisitions((prev) => prev.filter((r) => r.id !== id));
    toast("Requisição apagada", "ok");
    return null;
  };
  const approveRequisition: Store["approveRequisition"] = (id, accountId) => {
    const req = requisitions.find((r) => r.id === id);
    if (!req) return;
    setRequisitions((prev) => prev.map((r) => r.id === id ? { ...r, status: "aprovado", accountId, decidedAt: new Date().toISOString() } : r));
    setTransactions((prev) => [{
      id: "t" + Date.now(), accountId, type: "expense", amount: req.amount, category: req.category,
      description: `Requisição ${req.number} — ${req.purpose.slice(0, 40)}`, date: new Date().toISOString().slice(0, 10)
    }, ...prev]);
    applyToBalance(accountId, -req.amount);
    toast(`${req.number} aprovada — saída lançada`, "ok");
    gainXp(50, "Requisição aprovada");
  };
  const rejectRequisition: Store["rejectRequisition"] = (id, reason) => {
    setRequisitions((prev) => prev.map((r) => r.id === id ? { ...r, status: "reprovado", reason, decidedAt: new Date().toISOString() } : r));
    toast("Requisição reprovada", "warn");
  };

  // ---- Capital ----
  const addCapital: Store["addCapital"] = (d) => {
    const acc = accounts.find((a) => a.id === d.accountId);
    if (!acc) return "Conta inválida";
    if (d.kind === "retirada") {
      if (acc.currentBalance < d.amount) return "Saldo insuficiente na conta";
      const contributed = transactions.filter((t) => t.partnerId === d.partnerId && t.type === "capital_in").reduce((s, t) => s + t.amount, 0);
      const withdrawn = transactions.filter((t) => t.partnerId === d.partnerId && t.type === "capital_out").reduce((s, t) => s + t.amount, 0);
      if (contributed - withdrawn < d.amount) return `O sócio só tem ${(contributed - withdrawn).toLocaleString("pt-AO")} Kz de capital disponível`;
    }
    const tx: Transaction = {
      id: "t" + Date.now(), accountId: d.accountId, type: d.kind === "aporte" ? "capital_in" : "capital_out",
      amount: d.amount, partnerId: d.partnerId, partnerName: d.partnerName, category: "Capital",
      description: d.description || (d.kind === "aporte" ? "Aporte de capital" : "Retirada de capital"), date: d.date
    };
    setTransactions((prev) => [tx, ...prev]);
    applyToBalance(d.accountId, txDelta(tx));
    toast(d.kind === "aporte" ? "Aporte registado" : "Retirada registada", "ok");
    gainXp(40, d.kind === "aporte" ? "Aporte de sócio" : "Retirada de sócio");
    return null;
  };

  const updateProfile: Store["updateProfile"] = (p) => { setProfile((prev) => ({ ...prev, ...p })); toast("Perfil atualizado com sucesso!", "ok"); };

  return (
    <Ctx.Provider value={{
      ready, authed, login, logout, company, accounts, transactions, invoices, contacts, requisitions, badges, profile, toasts,
      updateCompany, addAccount, editAccount, deleteAccount, addTransaction, editTransaction, deleteTransaction, transfer,
      addInvoice, editInvoice, deleteInvoice, markPaid, addContact, editContact, removeContact,
      addRequisition, editRequisition, deleteRequisition, approveRequisition, rejectRequisition, addCapital, updateProfile, gainXp,
      taxRate: taxRateFor(company.regime)
    }}>
      {children}
    </Ctx.Provider>
  );
}
