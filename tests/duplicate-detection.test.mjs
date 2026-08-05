import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateGroups } from "../.test-build/imports/duplicate-detection.js";

test("a primeira ocorrência de um par duplicado aparece no grupo, não só a segunda", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 10000, direction: "expense", description: "COMBUSTÍVEL" },
    { id: "b", date: "2026-03-03", amount: 10000, direction: "expense", description: "COMBUSTÍVEL" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].itemIds.sort(), ["a", "b"]);
});

test("mesma referência de documento é o nível mais forte (confirmed)", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 5000, direction: "income", reference: "FT 2026/10", description: "venda" },
    { id: "b", date: "2026-03-04", amount: 5000, direction: "income", reference: "FT 2026/10", description: "outra descrição" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].tier, "confirmed");
});

test("mesma data+valor+direção+conta+contacto sem referência é probable", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 5000, direction: "expense", accountId: "acc1", contactId: "c1" },
    { id: "b", date: "2026-03-03", amount: 5000, direction: "expense", accountId: "acc1", contactId: "c1" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].tier, "probable");
});

test("mesma data+valor+descrição sem mais nada é possible", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 5000, description: "pagamento fornecedor" },
    { id: "b", date: "2026-03-03", amount: 5000, description: "PAGAMENTO FORNECEDOR" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].tier, "possible");
});

test("um item não entra em dois níveis ao mesmo tempo", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 5000, direction: "income", reference: "FT-1", accountId: "acc1", description: "venda" },
    { id: "b", date: "2026-03-03", amount: 5000, direction: "income", reference: "FT-1", accountId: "acc1", description: "venda" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].tier, "confirmed");
});

test("itens sem nenhuma coincidência não formam grupo", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 5000, direction: "income", description: "venda" },
    { id: "b", date: "2026-03-04", amount: 7000, direction: "expense", description: "combustível" },
  ];
  assert.deepEqual(findDuplicateGroups(itens), []);
});

test("três linhas iguais formam um único grupo com as três", () => {
  const itens = [
    { id: "a", date: "2026-03-03", amount: 1000, direction: "expense", description: "taxi" },
    { id: "b", date: "2026-03-03", amount: 1000, direction: "expense", description: "taxi" },
    { id: "c", date: "2026-03-03", amount: 1000, direction: "expense", description: "taxi" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].itemIds.length, 3);
});

test("compara linha nova contra lançamento já existente na organização", () => {
  const itens = [
    { id: "existing:je-99", date: "2026-03-03", amount: 20000, direction: "expense", reference: "FT-500" },
    { id: "row:42", date: "2026-03-03", amount: 20000, direction: "expense", reference: "FT-500" },
  ];
  const grupos = findDuplicateGroups(itens);
  assert.equal(grupos.length, 1);
  assert.ok(grupos[0].itemIds.includes("existing:je-99"));
  assert.ok(grupos[0].itemIds.includes("row:42"));
});
