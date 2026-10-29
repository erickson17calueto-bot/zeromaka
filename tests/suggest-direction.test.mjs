import test from "node:test";
import assert from "node:assert/strict";
import { suggestDirection } from "../.test-build/imports/suggest-direction.js";

test("identifica despesas comuns de diário de caixa", () => {
  // Casos reais do screenshot do utilizador
  assert.equal(suggestDirection("TRANSPORTE CUSTO COM PESSOAL"), "expense");
  assert.equal(suggestDirection("ÁGUA"), "expense");
  assert.equal(suggestDirection("AGUA"), "expense");

  // Outros casos angolanos frequentes
  assert.equal(suggestDirection("Abastecimento da carrinha (Gasóleo)"), "expense");
  assert.equal(suggestDirection("Pumangol - Combustível"), "expense");
  assert.equal(suggestDirection("Saldo de voz Unitel"), "expense");
  assert.equal(suggestDirection("Almoço da equipa"), "expense");
  assert.equal(suggestDirection("Pagamento de salário ao funcionário João"), "expense");
  assert.equal(suggestDirection("Compra de material de limpeza"), "expense");
  assert.equal(suggestDirection("Energia ENDE"), "expense");
});

test("identifica receitas", () => {
  assert.equal(suggestDirection("Venda a dinheiro - Cliente Manuel"), "income");
  assert.equal(suggestDirection("Recebimento de fatura FT 2026/01"), "income");
  assert.equal(suggestDirection("Cobrança de serviço de consultoria"), "income");
  assert.equal(suggestDirection("Depósito de cliente no banco"), "income");
});

test("retorna undefined quando não há pista clara ou em caso de ambiguidade", () => {
  assert.equal(suggestDirection("XYZ12345"), undefined);
  assert.equal(suggestDirection("Ref 998877"), undefined);
  assert.equal(suggestDirection(""), undefined);
  assert.equal(suggestDirection(null), undefined);
  assert.equal(suggestDirection("Referência CAIXA 998877"), undefined);
  assert.equal(suggestDirection("Pagamento e recebimento da mesma fatura"), undefined);
});

test("o verbo da operação prevalece sobre o nome do serviço ou entidade", () => {
  assert.equal(suggestDirection("Recebimento da Unitel"), "income");
  assert.equal(suggestDirection("Pagamento de consultoria"), "expense");
  assert.equal(suggestDirection("Taxista XPTO"), undefined);
});
