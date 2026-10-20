import test from "node:test";
import assert from "node:assert/strict";
import { isTradeInvoice, isLoanObligation, canInvoiceContact, hasDuplicateInvoice, matchesObligationStatus } from "../.test-build/obligations.js";

test("os cinco filtros preservam os estados parciais, vencidos e cancelados", () => {
  const statuses = ["open", "partial", "due_today", "overdue", "partial_overdue", "paid", "cancelled"];
  assert.deepEqual(statuses.filter(s => matchesObligationStatus(s, "all")), statuses);
  assert.deepEqual(statuses.filter(s => matchesObligationStatus(s, "open")), statuses.slice(0, 5));
  assert.deepEqual(statuses.filter(s => matchesObligationStatus(s, "overdue")), ["overdue", "partial_overdue"]);
  assert.deepEqual(statuses.filter(s => matchesObligationStatus(s, "paid")), ["paid"]);
  assert.deepEqual(statuses.filter(s => matchesObligationStatus(s, "cancelled")), ["cancelled"]);
});

test("faturas usam o tipo do documento, não o tipo do contacto", () => {
  for (const documentKind of ["invoice_reference", "product_sale", "service_charge"]) {
    assert.equal(isTradeInvoice({ direction: "receivable", documentKind }), true);
    assert.equal(isTradeInvoice({ direction: "payable", documentKind }), false);
  }
  assert.equal(isTradeInvoice({ direction: "payable", documentKind: "supplier_invoice" }), true);
  for (const documentKind of ["other", "expense_commitment", "employee_loan", "salary_advance", "third_party_loan"]) {
    assert.equal(isTradeInvoice({ direction: "receivable", documentKind }), false);
    assert.equal(isTradeInvoice({ direction: "payable", documentKind }), false);
  }
});

test("contactos comerciais são validados pela direção da fatura", () => {
  assert.equal(canInvoiceContact("receivable", "cliente"), true);
  assert.equal(canInvoiceContact("payable", "fornecedor"), true);
  assert.equal(canInvoiceContact("receivable", "ambos"), true);
  assert.equal(canInvoiceContact("payable", "ambos"), true);
  assert.equal(canInvoiceContact("receivable", "funcionario"), false);
  assert.equal(canInvoiceContact("payable", "cliente"), false);
});

test("empréstimos continuam identificados fora do formulário de faturas", () => {
  for (const documentKind of ["employee_loan", "salary_advance", "third_party_loan"]) {
    assert.equal(isLoanObligation({ direction: "receivable", documentKind }), true);
  }
  assert.equal(isLoanObligation({ direction: "receivable", documentKind: "other" }), false);
});

test("fatura paga não pode ser duplicada e dívida com igual referência não é fatura", () => {
  const invoice = { id: "1", direction: "receivable", documentKind: "invoice_reference", contactId: "customer", externalDocumentNumber: " FT-001 ", lifecycleStatus: "open", paidAmount: 100 };
  const candidate = { direction: "receivable", contactId: "customer", externalDocumentNumber: "ft-001" };
  assert.equal(hasDuplicateInvoice([invoice], candidate), true);
  assert.equal(hasDuplicateInvoice([invoice], { ...candidate, id: "1" }), false);
  assert.equal(hasDuplicateInvoice([{ ...invoice, lifecycleStatus: "cancelled" }], candidate), false);
  assert.equal(hasDuplicateInvoice([{ ...invoice, documentKind: "other" }], candidate), false);
  assert.equal(hasDuplicateInvoice([invoice], { ...candidate, contactId: "another-customer" }), false);
});
