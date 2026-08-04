import test from "node:test";
import assert from "node:assert/strict";
import { suggestAccount } from "../.test-build/imports/suggest-account.js";

const CAIXA = { id: "c1", name: "Caixa Físico", type: "cash" };
const BAI = { id: "b1", name: "BAI Empresa", type: "bank", bank: "BAI" };
const BFA = { id: "b2", name: "Conta Operacional", type: "bank", bank: "BFA" };
const UNITEL = { id: "m1", name: "Unitel Money", type: "mobile_money" };
const TODAS = [CAIXA, BAI, BFA, UNITEL];

test("o ficheiro real do diário de caixa cai na conta de caixa", () => {
  // Este é o nome exato do ficheiro que falhava: 526 linhas, nenhuma coluna de
  // conta, e todas davam erro de "conta não encontrada".
  assert.equal(suggestAccount(TODAS, "DIARIO DE CAIXA 1(DIARIO CAIXA).csv")?.id, CAIXA.id);
});

test("reconhece o nome da conta no título", () => {
  assert.equal(suggestAccount(TODAS, "Extrato BAI Empresa Agosto.xlsx")?.id, BAI.id);
  assert.equal(suggestAccount(TODAS, "movimentos-unitel-money.csv")?.id, UNITEL.id);
});

test("reconhece o banco quando o nome da conta não aparece", () => {
  assert.equal(suggestAccount(TODAS, "Extrato BFA 2026.csv")?.id, BFA.id);
});

test("o nome da folha conta tanto como o do ficheiro", () => {
  assert.equal(suggestAccount(TODAS, "livro.xlsx", "Caixa")?.id, CAIXA.id);
  assert.equal(suggestAccount(TODAS, "sem-pista.xlsx", "BAI Empresa")?.id, BAI.id);
});

test("prefere a correspondência mais específica", () => {
  const contas = [{ id: "x", name: "BAI", type: "bank" }, BAI];
  assert.equal(suggestAccount(contas, "extrato BAI Empresa.csv")?.id, BAI.id,
    "BAI Empresa é mais específico do que BAI");
});

test("não adivinha quando o tipo é ambíguo", () => {
  const doisCaixas = [
    { id: "k1", name: "Caixa Loja", type: "cash" },
    { id: "k2", name: "Caixa Armazém", type: "cash" },
    BAI,
  ];
  // "caixa" aponta para o tipo, mas há duas — escolher uma seria adivinhar mal
  // metade das vezes. Melhor devolver nada e deixar o utilizador decidir.
  assert.equal(suggestAccount(doisCaixas, "diario de caixa.csv"), undefined);
});

test("com uma só conta usa-a, mesmo sem pista no nome", () => {
  assert.equal(suggestAccount([BAI], "ficheiro-sem-nome-util.csv")?.id, BAI.id);
});

test("ignora contas arquivadas", () => {
  const arquivada = [{ ...CAIXA, isArchived: true }, BAI];
  assert.equal(suggestAccount(arquivada, "diario de caixa.csv"), undefined,
    "não deve sugerir uma conta que já não está em uso");
  assert.equal(suggestAccount([{ ...BAI, isArchived: true }], "seja o que for.csv"), undefined);
});

test("sem contas ou sem pistas não rebenta", () => {
  assert.equal(suggestAccount([], "diario de caixa.csv"), undefined);
  assert.equal(suggestAccount(TODAS, null, undefined, ""), undefined);
});

test("acentos e separadores não impedem a correspondência", () => {
  assert.equal(suggestAccount(TODAS, "DIÁRIO_DE_CAIXA.CSV")?.id, CAIXA.id);
  assert.equal(suggestAccount(TODAS, "extrato-bai-empresa.csv")?.id, BAI.id);
});
