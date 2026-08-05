import test from "node:test";
import assert from "node:assert/strict";
import { computeAccountBalance } from "../.test-build/accounts/balance.js";

const ACC = "acc-1";
let seq = 0;
function entry(overrides) {
  seq++;
  return {
    id: overrides.id || "e" + seq,
    entryNumber: "MOV-" + seq,
    entryType: overrides.entryType || "expense",
    transactionDate: overrides.transactionDate,
    description: overrides.description || "",
    status: overrides.status || "posted",
    source: "manual",
    createdAt: overrides.createdAt || overrides.transactionDate + "T00:00:00Z",
    postedAt: overrides.postedAt || overrides.transactionDate + "T00:00:00Z",
    reversesEntryId: overrides.reversesEntryId,
    metadata: {},
    lines: overrides.lines || [{ id: "l" + seq, accountId: ACC, direction: overrides.direction || "credit", amount: overrides.amount || 0 }],
  };
}

function opening(date, amount) {
  return entry({ transactionDate: date, entryType: "opening_balance", direction: "debit", amount });
}
function expense(date, amount) {
  return entry({ transactionDate: date, entryType: "expense", direction: "credit", amount });
}
function income(date, amount) {
  return entry({ transactionDate: date, entryType: "income", direction: "debit", amount });
}

test("1. saldo de abertura de hoje não é afetado por uma despesa antiga importada", () => {
  const entries = [
    opening("2026-08-05", 1000000),
    expense("2026-05-01", 200000), // anterior à data-base
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 1000000);
});

test("2. movimento no mesmo dia da abertura, posterior a ela, entra no saldo", () => {
  const entries = [
    opening("2026-08-05", 1000000),
    expense("2026-08-05", 100000),
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 900000);
});

test("3. movimento futuro não entra no saldo atual", () => {
  const entries = [
    opening("2026-08-05", 1000000),
    expense("2026-08-10", 100000), // futuro face a "hoje" = 2026-08-05
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 1000000);
});

test("4. abertura histórica: movimento entre a data-base e hoje entra normalmente", () => {
  const entries = [
    opening("2026-01-01", 1000000),
    expense("2026-01-05", 200000),
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-01-10"), 800000);
});

test("sem opening_balance, soma todo o histórico sem corte por data-base", () => {
  const entries = [
    income("2025-01-01", 500000),
    expense("2025-06-01", 100000),
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 500000 - 100000);
});

test("movimento futuro não conta mesmo sem opening_balance — a regra é sempre universal", () => {
  const entries = [
    income("2025-01-01", 500000),
    expense("2099-01-01", 50000), // futuro face a "hoje", independente de haver data-base
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 500000);
});

test("duas aberturas: usa a mais recente por data, a mais antiga fica como histórico normal", () => {
  const entries = [
    opening("2026-01-01", 500000),
    opening("2026-06-01", 1000000),
    expense("2026-03-01", 999999), // entre as duas aberturas — não conta para a data-base de junho
  ];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 1000000);
});

test("reversão de um movimento anterior à data-base não cria um movimento fantasma", () => {
  const original = expense("2026-05-01", 200000); // antes da abertura
  const reversal = entry({
    transactionDate: "2026-08-05", entryType: "reversal", direction: "debit", amount: 200000,
    reversesEntryId: original.id,
  });
  const entries = [opening("2026-08-05", 1000000), original, reversal];
  // A despesa original já não contava (histórico); a reversão, seguindo a
  // data dela, também não deve contar — senão o saldo subiria para 1.200.000
  // por reverter algo que nunca tinha sido descontado.
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 1000000);
});

test("reversão de um movimento posterior à data-base afeta o saldo normalmente", () => {
  const original = expense("2026-08-05", 100000); // no dia da abertura, conta
  const reversal = entry({
    transactionDate: "2026-08-06", entryType: "reversal", direction: "debit", amount: 100000,
    reversesEntryId: original.id,
  });
  const entries = [opening("2026-08-05", 1000000), original, reversal];
  // 1.000.000 - 100.000 (despesa) + 100.000 (reversão) = 1.000.000
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-06"), 1000000);
});

test("lançamento revertido (status reversed) não conta a dobrar com a sua reversão", () => {
  const original = entry({ id: "orig-1", transactionDate: "2026-08-05", entryType: "expense", direction: "credit", amount: 100000, status: "reversed" });
  const reversal = entry({
    transactionDate: "2026-08-06", entryType: "reversal", direction: "debit", amount: 100000,
    reversesEntryId: "orig-1",
  });
  const entries = [opening("2026-08-05", 1000000), original, reversal];
  // original está 'reversed' (não conta por si só); a reversão devolve os 100.000.
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-06"), 1000000);
});

test("linhas de outra conta são ignoradas", () => {
  const outraConta = entry({
    transactionDate: "2026-08-05", entryType: "expense",
    lines: [{ id: "x", accountId: "outra-conta", direction: "credit", amount: 300000 }],
  });
  const entries = [opening("2026-08-05", 1000000), outraConta];
  assert.equal(computeAccountBalance(ACC, entries, "2026-08-05"), 1000000);
});
