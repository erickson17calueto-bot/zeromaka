import test from "node:test";
import assert from "node:assert/strict";
import { detectRowKind } from "../.test-build/imports/row-kind.js";

test("linha de movimento normal continua 'movement'", () => {
  assert.equal(detectRowKind("ABASTECIMENTO DA CARRINHA (GASÓLEO)"), "movement");
});

test("sem descrição é 'movement' por omissão", () => {
  assert.equal(detectRowKind(""), "movement");
  assert.equal(detectRowKind(null), "movement");
  assert.equal(detectRowKind(undefined), "movement");
});

test("fecho da semana é linha de controlo", () => {
  assert.equal(detectRowKind("FECHO DA SEMANA"), "control");
});

test("saldo inicial e saldo final são linhas de controlo", () => {
  assert.equal(detectRowKind("SALDO INICIAL"), "control");
  assert.equal(detectRowKind("Saldo Final do dia"), "control");
});

test("reconciliação bancária é linha de controlo", () => {
  assert.equal(detectRowKind("RECONCILIAÇÃO BANCÁRIA - AGOSTO"), "control");
});

test("total geral é linha de controlo", () => {
  assert.equal(detectRowKind("TOTAL GERAL DA SEMANA"), "control");
});

test("uma descrição real que só contém 'total' de outra forma não é bloqueada por engano", () => {
  // "totalmente" não deve casar com "total geral" nem "totais" isolados
  assert.equal(detectRowKind("PAGAMENTO TOTALMENTE EM DINHEIRO"), "movement");
});

test("acentos não afetam a deteção", () => {
  assert.equal(detectRowKind("Reconciliacao bancaria do mes"), "control");
});
