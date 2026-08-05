import test from "node:test";
import assert from "node:assert/strict";
import { reconcileBalances } from "../.test-build/imports/balance-reconciliation.js";

test("sem coluna de saldo, tudo fica impossível de verificar", () => {
  const linhas = [
    { amount: 1000, direction: "income" },
    { amount: 500, direction: "expense" },
  ];
  const resultados = reconcileBalances(linhas);
  assert.equal(resultados[0].status, "unverifiable");
  assert.equal(resultados[1].status, "unverifiable");
});

test("saldos consistentes reconciliam", () => {
  const linhas = [
    { amount: 1000, direction: "income", declaredBalance: 1000 },
    { amount: 300, direction: "expense", declaredBalance: 700 },
    { amount: 200, direction: "income", declaredBalance: 900 },
  ];
  const resultados = reconcileBalances(linhas);
  // Primeira linha não tem saldo anterior para comparar.
  assert.equal(resultados[0].status, "unverifiable");
  assert.equal(resultados[1].status, "reconciled");
  assert.equal(resultados[1].difference, 0);
  assert.equal(resultados[2].status, "reconciled");
});

test("diferença pequena (arredondamento) não é tratada como erro grave", () => {
  const linhas = [
    { amount: 1000, direction: "income", declaredBalance: 1000 },
    { amount: 300, direction: "expense", declaredBalance: 701.5 }, // esperado 700, diff 1.5
  ];
  const resultados = reconcileBalances(linhas);
  assert.equal(resultados[1].status, "small_diff");
});

test("diferença grande é sinalizada como relevante", () => {
  const linhas = [
    { amount: 1000, direction: "income", declaredBalance: 1000 },
    { amount: 300, direction: "expense", declaredBalance: 5000 }, // esperado 700
  ];
  const resultados = reconcileBalances(linhas);
  assert.equal(resultados[1].status, "relevant_diff");
  assert.equal(resultados[1].difference, 4300);
});

test("linha sem valor (linha de controlo) não quebra a cadeia", () => {
  const linhas = [
    { amount: 1000, direction: "income", declaredBalance: 1000 },
    { amount: null, direction: null }, // ex: "FECHO DA SEMANA"
    { amount: 300, direction: "expense", declaredBalance: 700 },
  ];
  const resultados = reconcileBalances(linhas);
  assert.equal(resultados[0].status, "unverifiable");
  assert.equal(resultados[1].status, "no_movement");
  assert.equal(resultados[2].status, "reconciled");
});

test("um saldo declarado isolado volta a permitir reconciliar as linhas seguintes", () => {
  const linhas = [
    { amount: 1000, direction: "income" }, // sem saldo — unverifiable, quebra a cadeia
    { amount: 300, direction: "expense", declaredBalance: 700 }, // reseeda a partir daqui
    { amount: 100, direction: "income", declaredBalance: 800 },
  ];
  const resultados = reconcileBalances(linhas);
  assert.equal(resultados[0].status, "unverifiable");
  assert.equal(resultados[1].status, "unverifiable");
  assert.equal(resultados[2].status, "reconciled");
});
