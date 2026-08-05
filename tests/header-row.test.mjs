import test from "node:test";
import assert from "node:assert/strict";
import { encontrarLinhaCabecalho } from "../.test-build/imports/header-row.js";

test("cabeçalho na primeira linha continua a ser o escolhido", () => {
  const matriz = [
    ["DATA", "FATURA", "DESCRIÇÃO", "ENTRADA", "SAÍDA", "SALDO"],
    ["2024-04-22", "RQ - ABRIL / 37", "ENTRADA DE VALORES AO CAIXA", "120000", "", "120000"],
  ];
  assert.equal(encontrarLinhaCabecalho(matriz), 0);
});

// Caso real: a folha "Plan2" de "DIARIO DE CAIXA 1.xlsx" abre com um total solto
// antes da tabela. Ler a linha 0 como cabeçalho estragava o ficheiro inteiro.
test("salta títulos e totais antes da tabela", () => {
  const matriz = [
    ["", "", "", "TOTAL"],
    ["", "", "", "4336598.45"],
    ["DATA", "FATURA", "DESCRIÇÃO", "ENTRADA", "VALORES"],
    ["2026-03-03", "VD N.1376", "COMBUSTÍVEL", "10000", "cache"],
  ];
  assert.equal(encontrarLinhaCabecalho(matriz), 2);
});

test("uma só palavra reconhecida não faz de uma linha um cabeçalho", () => {
  // "DIÁRIO DE CAIXA" é um título; não deve ganhar à tabela verdadeira.
  const matriz = [
    ["DIÁRIO DE CAIXA", ""],
    ["DATA", "DESCRIÇÃO", "VALOR"],
    ["2026-01-05", "COMBUSTÍVEL", "10000"],
  ];
  assert.equal(encontrarLinhaCabecalho(matriz), 1);
});

test("sem nenhuma linha reconhecível usa a primeira", () => {
  const matriz = [["a", "b", "c"], ["1", "2", "3"]];
  assert.equal(encontrarLinhaCabecalho(matriz), 0);
});

test("só procura nas primeiras linhas", () => {
  const matriz = Array.from({ length: 40 }, () => ["", ""]);
  matriz[30] = ["DATA", "DESCRIÇÃO", "VALOR"];
  assert.equal(encontrarLinhaCabecalho(matriz), 0);
});

test("matriz vazia não rebenta", () => {
  assert.equal(encontrarLinhaCabecalho([]), 0);
});
