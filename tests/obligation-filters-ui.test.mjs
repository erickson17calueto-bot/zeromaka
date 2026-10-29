import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as helpers from "../.test-build/obligations.js";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../components/ObligationsView.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const statuses = ["open", "partial", "due_today", "overdue", "partial_overdue", "paid", "cancelled"];

function render(direction, scope, filter) {
  let hook = 0;
  const documents = ["receivable", "payable"].flatMap(dir => ["invoices", "other"].flatMap(kind => statuses.map(status => ({
    id: `${dir}-${kind}-${status}`, internalNumber: `${dir}-${kind}-${status}`,
    direction: dir, documentKind: kind === "other" ? "other" : dir === "receivable" ? "invoice_reference" : "supplier_invoice",
    contactId: dir, lifecycleStatus: status === "cancelled" ? "cancelled" : "open", financialStatus: status,
    originalAmount: 100, paidAmount: status === "paid" ? 100 : 0, outstandingAmount: status === "paid" ? 0 : 100,
    dueDate: "2026-10-20", issueDate: "2026-10-01", daysOverdue: 0,
  }))));
  const store = { obligations: documents, contacts: [{ id: "receivable", name: "Cliente", kind: "cliente" }, { id: "payable", name: "Fornecedor", kind: "fornecedor" }], accounts: [], categories: [], settlements: [], reserves: [], company: { regime: "geral" } };
  const module = { exports: {} };
  const mockRequire = id => {
    if (id === "react") return { ...React, useMemo: fn => fn(), useState: initial => {
      const index = hook++;
      return [index === 0 ? scope : index === 1 ? "" : index === 2 ? filter : initial, () => {}];
    } };
    if (id === "next/link") return { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
    if (id === "@/lib/store") return { useStore: () => store };
    if (id === "@/lib/obligations") return helpers;
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id === "@/lib/data") return { fmtKz: n => `${n} Kz`, fmtDate: s => s, daysUntil: () => 0, FIN_STATUS_LABEL: Object.fromEntries(statuses.map(s => [s, s])), OBLIGATION_KIND_LABEL: { other: "Outro", invoice_reference: "Fatura", supplier_invoice: "Fatura" } };
    return require(id);
  };
  vm.runInNewContext(code, { exports: module.exports, module, require: mockRequire });
  return renderToStaticMarkup(module.exports.default({ direction }));
}

for (const direction of ["receivable", "payable"]) for (const scope of ["invoices", "other"]) for (const filter of ["all", "open", "overdue", "paid", "cancelled"]) {
  test(`${direction}: ${scope} / ${filter} mostra apenas os documentos correspondentes`, () => {
    const html = render(direction, scope, filter);
    for (const label of ["Todos", "Em aberto", "Vencidos", "Pagos", "Cancelados", "Outras contas"]) assert.ok(html.includes(label), label);
    for (const dir of ["receivable", "payable"]) for (const kind of ["invoices", "other"]) for (const status of statuses) {
      assert.equal(html.includes(`${dir}-${kind}-${status}</span>`), dir === direction && kind === scope && helpers.matchesObligationStatus(status, filter), `${dir}/${kind}/${status}`);
    }
    assert.match(html, /aria-pressed="true"/);
  });
}
