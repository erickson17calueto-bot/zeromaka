export type ObligationScope = "invoices" | "other";
export type ObligationStatusFilter = "all" | "open" | "overdue" | "paid" | "cancelled";

export function matchesObligationStatus(status: string, filter: ObligationStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return ["open", "partial", "due_today", "overdue", "partial_overdue"].includes(status);
  if (filter === "overdue") return status === "overdue" || status === "partial_overdue";
  return status === filter;
}

type ObligationDocument = { direction: string; documentKind: string };

// O tipo do documento identifica a relação comercial. Uma dívida de um
// cliente continua a ser uma dívida, mesmo que use o mesmo contacto.
export function isTradeInvoice(document: ObligationDocument): boolean {
  return document.direction === "receivable"
    ? ["invoice_reference", "product_sale", "service_charge"].includes(document.documentKind)
    : document.direction === "payable" && document.documentKind === "supplier_invoice";
}

export function isLoanObligation(document: ObligationDocument): boolean {
  return ["employee_loan", "salary_advance", "third_party_loan"].includes(document.documentKind);
}

export function canInvoiceContact(direction: string, kind: string): boolean {
  if (direction !== "receivable" && direction !== "payable") return false;
  return kind === "ambos" || kind === (direction === "receivable" ? "cliente" : "fornecedor");
}

export function normalizeInvoiceNumber(value: string | undefined): string {
  return (value || "").trim().toLocaleLowerCase("pt-AO");
}

export function hasDuplicateInvoice(
  documents: (ObligationDocument & { id: string; contactId: string; externalDocumentNumber?: string; lifecycleStatus: string })[],
  candidate: { direction: string; contactId: string; externalDocumentNumber: string; id?: string },
): boolean {
  const number = normalizeInvoiceNumber(candidate.externalDocumentNumber);
  return !!number && documents.some(document => document.id !== candidate.id
    && isTradeInvoice(document) && document.direction === candidate.direction
    && document.contactId === candidate.contactId && document.lifecycleStatus !== "cancelled"
    && normalizeInvoiceNumber(document.externalDocumentNumber) === number);
}
