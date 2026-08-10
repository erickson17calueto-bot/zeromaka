export type AccountType = "bank" | "mobile_money" | "cash";
export type TxType = "income" | "expense" | "transfer_in" | "transfer_out" | "capital_in" | "capital_out";
export type InvoiceType = "receivable" | "payable";
export type InvoiceStatus = "pending" | "overdue" | "paid";
export type TaxRegime = "geral" | "simplificado" | "isencao";
export type ContactKind = "cliente" | "fornecedor" | "socio" | "funcionario" | "ambos";
export type ReqStatus = "pendente" | "aprovado" | "reprovado" | "aguardando_desembolso" | "desembolsada";
export type RequisitionType = "expense" | "purchase" | "employee_loan" | "salary_advance" | "operational_advance" | "other";
export const REQUISITION_TYPE_LABEL: Record<RequisitionType, string> = {
  expense: "Despesa", purchase: "Compra", employee_loan: "Empréstimo a funcionário",
  salary_advance: "Adiantamento salarial", operational_advance: "Adiantamento operacional", other: "Outro",
};
export type RecoveryMethod = "direct_payment" | "salary_deduction" | "mixed";
export const RECOVERY_METHOD_LABEL: Record<RecoveryMethod, string> = {
  direct_payment: "Pagamento direto", salary_deduction: "Desconto salarial", mixed: "Misto",
};
export const REQ_STATUS_LABEL: Record<ReqStatus, string> = {
  pendente: "Pendente", aprovado: "Aprovada", reprovado: "Reprovada",
  aguardando_desembolso: "Aguardando desembolso", desembolsada: "Desembolsada",
};
export type PaymentTerm = "pronto" | "credito15" | "credito30" | "credito60" | "credito90" | "mensal";
export type SocioRole = "gerente" | "investidor" | "outro";

export interface Account {
  id: string; name: string; type: AccountType; bank?: string;
  initialBalance: number; currentBalance: number;
  isArchived?: boolean; currency?: string;
}

export type JournalEntryType = "income" | "expense" | "transfer" | "opening_balance" | "adjustment" | "reversal";
export type JournalStatus = "posted" | "reversed";
export type LineDirection = "debit" | "credit";
export type FinCategoryType = "income" | "expense";

export interface FinancialCategory {
  id: string; organizationId: string; name: string; categoryType: FinCategoryType;
  parentId?: string; isSystem: boolean; isActive: boolean; createdAt: string;
}

// Tipo de documento de um lançamento ou liquidação — sempre opcional: muitos
// pagamentos não têm fatura, e isso não pode impedir o registo do movimento.
export type EntryDocumentKind =
  | "invoice" | "receipt" | "credit_note" | "debit_note" | "purchase_order"
  | "contract" | "bank_proof" | "ticket" | "internal" | "other" | "none";

export const ENTRY_DOCUMENT_KIND_LABEL: Record<EntryDocumentKind, string> = {
  invoice: "Fatura", receipt: "Recibo", credit_note: "Nota de crédito",
  debit_note: "Nota de débito", purchase_order: "Ordem de compra", contract: "Contrato",
  bank_proof: "Comprovativo bancário", ticket: "Talão", internal: "Documento interno",
  other: "Outro", none: "Sem documento",
};

export interface JournalLine {
  id: string; accountId: string; direction: LineDirection; amount: number;
}

export interface JournalEntry {
  id: string; entryNumber: string; entryType: JournalEntryType;
  transactionDate: string; description: string; reference?: string;
  contactId?: string; categoryId?: string; categoryName?: string;
  status: JournalStatus; source: string;
  createdAt: string; postedAt: string;
  reversedAt?: string; reversedByEntryId?: string;
  reversesEntryId?: string; reversalReason?: string;
  // Documento do lançamento — distinto de `reference` (referência
  // bancária/de pagamento, já existente): documentNumber é o número do
  // PRÓPRIO documento (fatura/recibo/nota), não a referência do movimento.
  documentKind?: EntryDocumentKind; documentNumber?: string;
  documentDate?: string; documentNotes?: string;
  metadata: Record<string, unknown>;
  lines: JournalLine[];
}
export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type RecurringTransactionKind = "income" | "expense";

export interface RecurringTransaction {
  id: string; organizationId: string; accountId: string; kind: RecurringTransactionKind;
  amount: number; description: string; categoryId?: string; contactId?: string;
  frequency: RecurringFrequency; startDate: string; nextRunDate: string;
  lastGeneratedAt?: string; active: boolean; createdAt: string;
}

export type BankStatementDirection = "incoming" | "outgoing";
export type BankStatementStatus = "unmatched" | "matched" | "ignored";

export interface BankStatementLine {
  id: string; organizationId: string; accountId: string; transactionDate: string;
  amount: number; direction: BankStatementDirection; description: string;
  reference?: string; externalId?: string; status: BankStatementStatus;
  matchedJournalEntryId?: string; matchedEntryDescription?: string;
  matchedAt?: string; importedAt: string;
}
export interface Transaction {
  id: string; accountId: string; type: TxType; amount: number;
  category: string; subcategory?: string; description: string; date: string;
  isSale?: boolean; taxAmount?: number; partnerId?: string; partnerName?: string;
  linkId?: string; invoiceId?: string;
  // categoryId é a fonte de verdade quando presente (categoria escolhida por
  // id, com subcategoria); `category`/`subcategory` (nomes) ficam para
  // compatibilidade com leitores que ainda não foram migrados.
  categoryId?: string;
  reference?: string; documentKind?: EntryDocumentKind; documentNumber?: string;
  documentDate?: string; documentNotes?: string;
}
export interface Invoice {
  id: string; contactName: string; contactId?: string; type: InvoiceType; amount: number;
  dueDate: string; issueDate?: string; status: InvoiceStatus; category: string;
  isSale?: boolean; taxAmount?: number; accountId?: string; paidAt?: string; notes?: string;
}
export interface Contact {
  id: string; name: string; kind: ContactKind; phone?: string; nif?: string;
  email?: string; location?: string; paymentTerm?: PaymentTerm; role?: SocioRole; notes?: string;
  whatsapp?: string; creditLimit?: number; isArchived?: boolean;
}

// ---- Fase 3: contas a receber/pagar ----
export type ObligationDirection = "receivable" | "payable";
export type ObligationDocumentKind =
  | "invoice_reference" | "service_charge" | "product_sale"
  | "supplier_invoice" | "expense_commitment" | "other"
  // Só criadas via grant_employee_loan — nunca pelo formulário normal de
  // fatura, porque estas já nascem com o desembolso feito (ver disbursementEntryId).
  | "employee_loan" | "salary_advance";
export type ObligationLifecycle = "open" | "cancelled";
export type FinancialStatus =
  | "cancelled" | "paid" | "partial" | "overdue" | "partial_overdue" | "due_today" | "open";
export type SettlementDirection = "incoming" | "outgoing";
export type SettlementStatus = "posted" | "reversed";
export type CollectionChannel = "whatsapp" | "phone" | "email" | "in_person" | "other";
export type CollectionInteractionType =
  | "reminder" | "collection" | "negotiation" | "promise_to_pay" | "dispute" | "note";
export type CollectionOutcome =
  | "contacted" | "no_response" | "promised_payment" | "disputed"
  | "paid" | "follow_up_required" | "other";

// Linha da view obligation_status (estado calculado no servidor)
export interface Obligation {
  id: string; organizationId: string; direction: ObligationDirection;
  internalNumber: string; contactId: string; contactName?: string;
  documentKind: ObligationDocumentKind; externalDocumentNumber?: string;
  issueDate: string; dueDate: string; originalAmount: number; currencyCode: string;
  description?: string; notes?: string; lifecycleStatus: ObligationLifecycle;
  categoryId?: string; isSale?: boolean; taxAmount?: number;
  paidAmount: number; outstandingAmount: number; daysOverdue: number;
  financialStatus: FinancialStatus;
  // Só preenchido para documentKind employee_loan/salary_advance — aponta
  // para o lançamento que já tirou o dinheiro da conta na concessão.
  disbursementEntryId?: string;
  // Preenchido quando a obrigação nasceu de uma requisição (criada direto
  // ou reclassificada de uma requisição antiga já aprovada).
  sourceRequisitionId?: string;
}

export interface SettlementAllocation { id: string; obligationId: string; allocatedAmount: number; journalEntryId?: string; }
export interface Settlement {
  id: string; internalNumber: string; direction: SettlementDirection;
  contactId: string; accountId: string; paymentDate: string; totalAmount: number;
  paymentMethod?: string; reference?: string; notes?: string; status: SettlementStatus;
  documentKind?: EntryDocumentKind; documentNumber?: string;
  reversedAt?: string; reversalReason?: string; allocations: SettlementAllocation[];
}

export interface CollectionInteraction {
  id: string; obligationId?: string; contactId: string;
  channel: CollectionChannel; interactionType: CollectionInteractionType;
  message?: string; outcome?: CollectionOutcome;
  promisedPaymentDate?: string; nextFollowUpAt?: string; performedAt: string;
}

// ---- Fase 4: reservas e disponível de verdade ----
export type ReserveCategoryType =
  | "payroll" | "tax" | "emergency" | "rent" | "supplier" | "maintenance" | "investment" | "custom";
export type ReserveType = "general" | "account_specific" | "obligation_linked";
export type ReserveStatus = "active" | "partially_released" | "released" | "cancelled";
export type ReservePriority = "critical" | "high" | "normal" | "low";
export type ReserveMovementType = "create" | "increase" | "decrease" | "release" | "cancel" | "consume_on_payment";
export type SafetyState = "safe" | "warning" | "critical";

export interface ReserveCategory {
  id: string; organizationId: string; name: string;
  categoryType: ReserveCategoryType; isSystem: boolean; isActive: boolean;
}

export interface FinancialReserve {
  id: string; organizationId: string; categoryId: string; name: string;
  description?: string; reserveType: ReserveType;
  accountId?: string; obligationId?: string;
  targetAmount?: number; reservedAmount: number;
  startDate: string; targetDate?: string;
  status: ReserveStatus; priority: ReservePriority;
  releasedAt?: string; releaseReason?: string;
}

export interface ReserveMovement {
  id: string; reserveId: string; movementType: ReserveMovementType;
  amount: number; reason?: string; settlementId?: string; createdAt: string;
}

export interface FinancialSettings {
  horizonDays: 7 | 15 | 30;
  includeOverduePayables: boolean;
  includeApprovedRequisitions: boolean;
  includeArchivedAccounts: boolean;
  minimumCashBuffer: number;
}

// Resposta de get_true_available_cash (calculado no servidor, nunca no frontend)
export interface TrueAvailableCash {
  currentCashBalance: number;
  activeReservesTotal: number;
  minimumCashBuffer: number;
  overduePayablesTotal: number;
  upcomingPayablesTotal: number;
  approvedRequisitionsTotal: number;
  coveredObligationsTotal: number;
  uncoveredCommitmentsTotal: number;
  trueAvailableCash: number;
  calculationDate: string;
  horizonDays: number;
  horizonEndDate: string;
  safetyState: SafetyState;
  breakdown: {
    accounts: { id: string; name: string; balance: number; archived: boolean }[];
    reserves: { id: string; name: string; amount: number; priority: ReservePriority; type: ReserveType; obligation_id?: string }[];
    obligations: { id: string; number: string; due_date: string; outstanding: number; covered: number; uncovered: number; overdue: boolean }[];
    requisitions: { id: string; number: string; amount: number }[];
  };
}

export const RESERVE_PRIORITY_LABEL: Record<ReservePriority, string> = {
  critical: "Crítica", high: "Alta", normal: "Normal", low: "Baixa",
};
export const RESERVE_STATUS_LABEL: Record<ReserveStatus, string> = {
  active: "Ativa", partially_released: "Parcialmente libertada", released: "Libertada", cancelled: "Cancelada",
};
export const SAFETY_STATE_LABEL: Record<SafetyState, string> = {
  safe: "Seguro", warning: "Atenção", critical: "Crítico",
};

export const FIN_STATUS_LABEL: Record<FinancialStatus, string> = {
  cancelled: "Cancelado", paid: "Pago", partial: "Parcial", overdue: "Vencido",
  partial_overdue: "Parcial e vencido", due_today: "Vence hoje", open: "Em aberto",
};

export const OBLIGATION_KIND_LABEL: Record<ObligationDocumentKind, string> = {
  invoice_reference: "Referência de fatura", service_charge: "Serviço",
  product_sale: "Venda de produto", supplier_invoice: "Fatura de fornecedor",
  expense_commitment: "Compromisso de despesa", other: "Outro",
  employee_loan: "Empréstimo a funcionário", salary_advance: "Adiantamento salarial",
};

// Tipos de documento que só nascem via grant_employee_loan — nunca aparecem
// como opção no formulário normal de "nova fatura" (ObligationsView), porque
// já vêm com o desembolso feito; escolhê-los ali criaria uma obrigação sem o
// dinheiro correspondente ter saído da conta.
export const EMPLOYEE_LOAN_KINDS: ObligationDocumentKind[] = ["employee_loan", "salary_advance"];

// Modelo de mensagem de cobrança (editável antes de enviar manualmente)
export function collectionMessage(clientName: string, docNumber: string, amount: number, dueDate: string): string {
  return `Olá, ${clientName}. Esperamos que esteja bem. Verificámos que o pagamento referente ao documento ${docNumber}, no valor pendente de ${fmtKz(amount)}, venceu em ${fmtDate(dueDate)}. Poderia, por favor, confirmar a previsão de pagamento?`;
}

// Link wa.me com mensagem pré-preenchida (não envia — abre o WhatsApp)
export function whatsappLink(phone: string, message: string): string {
  const clean = (phone || "").replace(/[^0-9]/g, "");
  const num = clean.startsWith("244") ? clean : "244" + clean;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}
export interface ReqItem { description: string; qty: number; unitPrice: number; }
export interface Requisition {
  id: string; number: string; requester: string; approver: string;
  department?: string; items?: ReqItem[];
  amount: number; date: string; purpose: string; category: string;
  status: ReqStatus; accountId?: string; decidedAt?: string; reason?: string;
  type: RequisitionType;
  // Só relevantes quando type = employee_loan/salary_advance/operational_advance.
  beneficiaryContactId?: string; dueDate?: string; installments?: number; recoveryMethod?: RecoveryMethod;
}
export interface CommissionMember { id: string; name: string; percent: number; }
export interface Commissions {
  paysCommercial: boolean; members: CommissionMember[];
  paysClients: boolean; clientPercent: number; clientNote: string;
}
export interface Company {
  name: string; nif: string; logo?: string; regime: TaxRegime;
  address: string; phone: string; email?: string; commissions: Commissions;
}
export interface Badge { id: string; name: string; desc: string; xp: number; unlocked: boolean; }
export interface UserProfile {
  name: string; phone: string; email: string; bi: string;
  plan: "Gratuito" | "Pessoal" | "Pro" | "Business"; renewal: string;
  xp: number; level: number; streak: number; lastActive: string;
}

export const REGIMES: Record<TaxRegime, { label: string; rate: number; tax: string; short: string }> = {
  geral: { label: "Regime Geral", rate: 0.14, tax: "IVA 14%", short: "Geral · IVA 14%" },
  simplificado: { label: "Regime Simplificado", rate: 0.07, tax: "IVA 7%", short: "Simplificado · IVA 7%" },
  isencao: { label: "Regime de Exclusão", rate: 0.01, tax: "Imposto de Selo 1%", short: "Exclusão · Selo 1%" }
};
export const taxRateFor = (r: TaxRegime) => REGIMES[r].rate;

/**
 * Base de incidência do imposto sobre uma venda, por regime (regras AGT).
 *
 *  - Regime Geral (IVA 14%): o IVA é liquidado e acrescido na fatura, logo o
 *    valor registado JÁ CONTÉM o imposto  ->  imposto = valor − valor/(1+taxa).
 *  - Regime Simplificado (7%): não se liquida IVA na fatura; o imposto apura-se
 *    aplicando a taxa ao valor recebido   ->  imposto = valor × taxa.
 *  - Regime de Exclusão (Selo 1%): não há IVA e a fatura não inclui imposto; o
 *    Imposto de Selo incide sobre o recibo ->  imposto = valor × taxa.
 *
 * Exemplo: 2.100.000 no Regime de Exclusão -> 21.000 (e não 20.792).
 *
 * Espelha a função org_sale_tax() no servidor, que é a fonte de verdade.
 */
export const TAX_INSIDE_VALUE: Record<TaxRegime, boolean> = {
  geral: true,          // IVA liquidado na fatura: está por dentro do total
  simplificado: false,  // fatura sem IVA: taxa aplicada sobre o valor
  isencao: false,       // fatura sem imposto: Selo aplicado sobre o valor
};

export function saleTax(value: number, regime: TaxRegime): number {
  if (!value || value <= 0) return 0;
  const rate = REGIMES[regime].rate;
  const tax = TAX_INSIDE_VALUE[regime] ? value - value / (1 + rate) : value * rate;
  return Math.round(tax * 100) / 100;
}

/** @deprecated Usa saleTax(valor, regime) — esta assumia imposto por dentro em
 *  todos os regimes, o que só é verdade no Regime Geral. Mantida só para os
 *  dados de demonstração abaixo, que são todos de regime geral. */
export const taxIncluded = (value: number, rate: number) => Math.round(value - value / (1 + rate));

export const PAYMENT_TERMS: Record<PaymentTerm, string> = {
  pronto: "Pronto pagamento", credito15: "Crédito 15 dias", credito30: "Crédito 30 dias",
  credito60: "Crédito 60 dias", credito90: "Crédito 90 dias", mensal: "Mensal (fecho de mês)"
};
export const termDays: Record<PaymentTerm, number> = { pronto: 0, credito15: 15, credito30: 30, credito60: 60, credito90: 90, mensal: 30 };
export const SOCIO_ROLES: Record<SocioRole, string> = { gerente: "Sócio-gerente", investidor: "Sócio investidor", outro: "Outro" };

export const BANKS = ["BAI", "BFA", "BIC", "BCI", "BPC", "Standard Bank", "Banco Sol", "Banco Keve", "Millennium Atlântico", "Banco Económico", "BCGA", "Outro"];

// Categorias de FATURA (contextuais ao tipo)
export const INVOICE_CATEGORIES: Record<InvoiceType, string[]> = {
  receivable: ["Venda de mercadorias", "Venda de serviços"],
  payable: ["Compra de mercadorias", "Compra de serviços", "Outras despesas"]
};

// Categorias de TRANSAÇÃO (sem "Vendas" — vendas entram por Faturas) com subcategorias
export const TX_INCOME_CATEGORIES = ["Outras receitas", "Juros / rendimentos", "Reembolso", "Venda de ativo"];
export const TX_EXPENSE_CATEGORIES = ["Compra de mercadorias", "Renda / Aluguer", "Salários", "Transporte", "Consumíveis", "Equipamento", "Comunicações", "Impostos (AGT)", "Marketing", "Comissões", "Manutenção", "Outras despesas"];
export const SUBCATEGORIES: Record<string, string[]> = {
  "Compra de mercadorias": ["Mercadoria para revenda", "Matéria-prima", "Embalagens"],
  "Renda / Aluguer": ["Armazém", "Loja / Escritório", "Equipamento"],
  "Salários": ["Ordenados", "Subsídios", "Horas extra"],
  "Transporte": ["Combustível", "Manutenção de viatura", "Táxi / Entregas", "Portagens"],
  "Consumíveis": ["Copa / Limpeza", "Material de escritório"],
  "Equipamento": ["Informático", "Cozinha", "Mobiliário"],
  "Comunicações": ["Internet", "Telefone", "Software / Subscrições"],
  "Marketing": ["Publicidade online", "Impressão / Brindes", "Eventos"],
  "Comissões": ["Departamento comercial", "Cliente / Parceiro"],
  "Outras despesas": ["Bancárias", "Taxas / Licenças", "Diversos"]
};
// Lista plana usada em Requisições (despesas)
export const CATEGORIES = TX_EXPENSE_CATEGORIES;

export const LEVELS = [
  { level: 1, name: "Iniciante", min: 0 }, { level: 2, name: "Organizado", min: 500 },
  { level: 3, name: "Gestor Master", min: 1500 }, { level: 4, name: "Investidor", min: 4000 },
  { level: 5, name: "Magnata", min: 8000 }
];
export function levelFor(xp: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) cur = l;
  const next = LEVELS.find((l) => l.min > xp);
  return { ...cur, next, progress: next ? (xp - cur.min) / (next.min - cur.min) : 1 };
}

export function fmtKz(v: number) {
  return new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(Math.round(v)) + " Kz";
}
export function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}
export function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
const iso = (o: number) => { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); };

export const seedCompany: Company = {
  name: "BLUEAXIS TRADING, LDA", nif: "5417089321", regime: "geral",
  address: "Nova Vida, Luanda", phone: "+244 923 000 000", email: "geral@blueaxis.ao",
  commissions: { paysCommercial: false, members: [], paysClients: false, clientPercent: 0, clientNote: "" }
};

export const seedAccounts: Account[] = [
  { id: "a1", name: "BAI Empresa", type: "bank", bank: "BAI", initialBalance: 1200000, currentBalance: 1846500 },
  { id: "a2", name: "Unitel Money", type: "mobile_money", initialBalance: 150000, currentBalance: 238400 },
  { id: "a3", name: "Caixa Físico", type: "cash", initialBalance: 80000, currentBalance: 64200 }
];

export const seedTransactions: Transaction[] = [
  { id: "t3", accountId: "a1", type: "expense", amount: 210000, category: "Compra de mercadorias", subcategory: "Mercadoria para revenda", description: "Compra de mercadoria — Angomart", date: iso(-3) },
  { id: "t4", accountId: "a3", type: "expense", amount: 15800, category: "Transporte", subcategory: "Combustível", description: "Combustível entregas", date: iso(-3) },
  { id: "tc1", accountId: "a1", type: "capital_in", amount: 1500000, partnerId: "s1", partnerName: "Sócio Investidor", category: "Capital", description: "Aporte para captação societária", date: iso(-20) },
  { id: "t5", accountId: "a1", type: "expense", amount: 350000, category: "Renda / Aluguer", subcategory: "Armazém", description: "Renda do armazém — Julho", date: iso(-6) },
  { id: "t7", accountId: "a3", type: "expense", amount: 9500, category: "Consumíveis", subcategory: "Copa / Limpeza", description: "Café, açúcar e chá — copa", date: iso(-9) },
  { id: "t8", accountId: "a1", type: "expense", amount: 145000, category: "Salários", subcategory: "Ordenados", description: "Salário — Maria (cozinha)", date: iso(-12) }
];

export const seedInvoices: Invoice[] = [
  { id: "i1", contactName: "Hotel Talatona", type: "receivable", amount: 380000, taxAmount: taxIncluded(380000, 0.14), isSale: true, issueDate: iso(-1), dueDate: iso(2), status: "pending", category: "Venda de mercadorias" },
  { id: "i2", contactName: "Hotel Presidente", type: "receivable", amount: 265000, taxAmount: taxIncluded(265000, 0.14), isSale: true, issueDate: iso(-7), dueDate: iso(-4), status: "overdue", category: "Venda de mercadorias" },
  { id: "i3", contactName: "Epic Sana", type: "receivable", amount: 120000, taxAmount: taxIncluded(120000, 0.14), isSale: true, issueDate: iso(-15), dueDate: iso(-10), status: "paid", category: "Venda de serviços", paidAt: iso(-9), accountId: "a1" },
  { id: "i4", contactName: "Distribuidora Angomart", type: "payable", amount: 540000, issueDate: iso(-2), dueDate: iso(3), status: "pending", category: "Compra de mercadorias" },
  { id: "i5", contactName: "ENDE — Electricidade", type: "payable", amount: 42600, issueDate: iso(-10), dueDate: iso(-2), status: "overdue", category: "Outras despesas" },
  { id: "i6", contactName: "Talho Central", type: "payable", amount: 186000, issueDate: iso(-3), dueDate: iso(12), status: "pending", category: "Compra de mercadorias" }
];

export const seedContacts: Contact[] = [
  { id: "c1", name: "Hotel Presidente", kind: "cliente", phone: "+244 222 000 111", nif: "5000111222", location: "Ingombota, Luanda", paymentTerm: "credito30", email: "compras@presidente.ao" },
  { id: "c2", name: "Hotel Talatona", kind: "cliente", phone: "+244 222 000 222", nif: "5000222333", location: "Talatona, Luanda", paymentTerm: "credito15" },
  { id: "c3", name: "Epic Sana", kind: "cliente", phone: "+244 222 000 333", nif: "5000333444", location: "Marginal, Luanda", paymentTerm: "pronto" },
  { id: "f1", name: "Distribuidora Angomart", kind: "fornecedor", phone: "+244 923 111 222", nif: "5411222333", location: "Viana, Luanda", paymentTerm: "credito30", notes: "Vende a crédito 30 dias" },
  { id: "f2", name: "Talho Central", kind: "fornecedor", phone: "+244 923 111 333", nif: "5411333444", location: "Kilamba, Luanda", paymentTerm: "credito15" },
  { id: "s1", name: "Sócio Investidor", kind: "socio", phone: "+244 923 999 000", role: "investidor", notes: "Quota 50% — suprimentos" },
  { id: "s2", name: "Erickson Fonseca", kind: "socio", phone: "+244 923 999 111", role: "gerente", notes: "Sócio-gerente" }
];

export const seedRequisitions: Requisition[] = [
  { id: "r1", number: "RQ-001/07/2026", requester: "Maria Cozinha", approver: "Erickson Fonseca", department: "Cozinha", items: [{ description: "Café torrado (pacote 1kg)", qty: 3, unitPrice: 4500 }, { description: "Açúcar (saco 5kg)", qty: 2, unitPrice: 3200 }, { description: "Chá preto (caixa)", qty: 4, unitPrice: 2000 }], amount: 28000, date: iso(-1), purpose: "Compra urgente de consumíveis para a copa, sem fatura.", category: "Consumíveis", status: "pendente", type: "expense" },
  { id: "r2", number: "RQ-002/07/2026", requester: "João Entregas", approver: "Erickson Fonseca", department: "Logística", items: [{ description: "Reparação de pneu da carrinha", qty: 1, unitPrice: 12000 }], amount: 12000, date: iso(-2), purpose: "Furo no pneu dianteiro durante entrega.", category: "Transporte", status: "pendente", type: "expense" }
];

export const seedBadges: Badge[] = [
  { id: "b1", name: "Primeiro Passo", desc: "Registou a primeira transacção", xp: 50, unlocked: true },
  { id: "b2", name: "7 Dias de Disciplina", desc: "Streak de 7 dias consecutivos", xp: 150, unlocked: true },
  { id: "b3", name: "Corte Cirúrgico", desc: "Reduziu despesas 15% num mês", xp: 200, unlocked: true },
  { id: "b4", name: "Caçador de Dívidas", desc: "Cobrou 3 faturas vencidas", xp: 250, unlocked: false },
  { id: "b5", name: "Estado em Dia", desc: "Apurou o imposto de 10 vendas", xp: 300, unlocked: false },
  { id: "b6", name: "Magnata do Kwanza", desc: "Atingiu 5M Kz de receitas acumuladas", xp: 500, unlocked: false }
];

export const seedProfile: UserProfile = {
  name: "Erickson Fonseca", phone: "+244 923 999 111", email: "erickson@zeromaka.ao",
  bi: "004567890LA042", plan: "Business", renewal: iso(23), xp: 1840, level: 3, streak: 9, lastActive: iso(0)
};

export const seedRanking = [
  { name: "Tchissola M.", xp: 2450, health: 94 }, { name: "Erickson Fonseca", xp: 1840, health: 91, me: true },
  { name: "Adilson P.", xp: 1620, health: 88 }, { name: "Ngonga V.", xp: 1330, health: 85 }, { name: "Luena K.", xp: 990, health: 79 }
];
