import test from "node:test";
import assert from "node:assert/strict";
import { contactFromRow, createContactDuplicateIndex, detectContactColumns, findContactDuplicate, parseContactPaymentTerm } from "../.test-build/imports/contact-import.js";

test("mapeia cabeçalhos comuns de listas de fornecedores", () => {
  const headers = ["Razão social", "N.I.F.", "Telefone principal", "E-mail", "Morada", "Prazo de pagamento"];
  const mapping = detectContactColumns(headers);
  assert.equal(mapping.name, "Razão social");
  assert.equal(mapping.nif, "N.I.F.");
  assert.equal(mapping.phone, "Telefone principal");
  assert.equal(mapping.email, "E-mail");
  assert.equal(mapping.location, "Morada");
  assert.equal(mapping.paymentTerm, "Prazo de pagamento");
  const row = contactFromRow({ "Razão social": "  Oficina  Norte  ", "N.I.F.": "5000.111.222", "Telefone principal": "+244 923 456 789" }, mapping);
  assert.equal(row.name, "Oficina Norte");
  assert.equal(row.nif, "5000.111.222");
  assert.equal(row.phone, "+244 923 456 789");
});

test("não inventa campos que não estão na folha", () => {
  const mapping = detectContactColumns(["Cliente", "Cidade"]);
  assert.deepEqual(mapping, { name: "Cliente" });
  const row = contactFromRow({ Cliente: "Ana Sousa", Cidade: "Luanda" }, mapping);
  assert.equal(row.name, "Ana Sousa");
  assert.equal(row.location, "");
});

const existing = [
  { name: "José Comercial, Lda", kind: "cliente", nif: "003.456.789-LA042", phone: "+244 923 456 789", email: "compras@exemplo.ao" },
];

test("bloqueia duplicado por NIF antes do nome", () => {
  const found = findContactDuplicate({ name: "Outra empresa", nif: "003456789la042" }, existing);
  assert.equal(found?.field, "nif");
});

test("bloqueia duplicado por telefone com e sem indicativo", () => {
  const found = findContactDuplicate({ name: "Outro nome", phone: "923 456 789" }, existing);
  assert.equal(found?.field, "phone");
  assert.equal(createContactDuplicateIndex(existing).find({ name: "Outro nome", phone: "00244 923 456 789" })?.field, "phone");
});

test("bloqueia por e-mail ou nome exato normalizado, sem usar correspondência aproximada", () => {
  assert.equal(findContactDuplicate({ name: "Novo", email: "COMPRAS@EXEMPLO.AO" }, existing)?.field, "email");
  assert.equal(findContactDuplicate({ name: "Jose Comercial Lda" }, existing)?.field, "name");
  assert.equal(findContactDuplicate({ name: "José Comercial" }, existing), null);
});

test("interpreta prazo conhecido e deixa desconhecido para correção", () => {
  assert.equal(parseContactPaymentTerm("Crédito a 30 dias"), "credito30");
  for (const term of ["credito15", "credito30", "credito60", "credito90"]) {
    assert.equal(parseContactPaymentTerm(term), term);
  }
  assert.equal(parseContactPaymentTerm("a pronto"), "pronto");
  assert.equal(parseContactPaymentTerm("quando possível"), undefined);
});

test("índice reconhece duplicados dentro do próprio ficheiro", () => {
  const index = createContactDuplicateIndex([]);
  assert.equal(index.find({ name: "Oficina Norte", nif: "5000111222" }), null);
  index.add({ name: "Oficina Norte", nif: "5000111222", kind: "ficheiro" });
  assert.equal(index.find({ name: "Outro nome", nif: "5000.111.222" })?.field, "nif");
});
