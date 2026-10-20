import test from "node:test";
import assert from "node:assert/strict";
import { parseImportAmount, parseImportDate, isValidImportDate } from "../.test-build/imports/parse-values.js";

test("interpreta valores portugueses e separadores de milhares", () => {
  assert.equal(parseImportAmount("1.234,56 Kz"), 1234.56);
  assert.equal(parseImportAmount("1.234 Kz"), 1234);
  assert.equal(parseImportAmount("(1 234,50)"), 1234.5);
});

test("recusa datas de calendário impossíveis", () => {
  assert.equal(parseImportDate("31/02/2026"), "");
  assert.equal(parseImportDate("28/02/2026"), "2026-02-28");
  assert.equal(isValidImportDate("2026-02-29"), false);
});
