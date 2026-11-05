import test from "node:test";
import assert from "node:assert/strict";
import { decodeCsvBuffer, parseCsv } from "../.test-build/imports/csv.js";
import { encontrarLinhaCabecalho } from "../.test-build/imports/header-row.js";
import { detectImportDateOrder, readImportedInvoice } from "../.test-build/imports/invoice-import.js";

const sample = Buffer.from('GESTÃO DE VENDAS;;;;\r\nNº;Nº FATURA;CLIENTE;VALOR (Kz);"DATA ENTRADA\r\nFATURA";"DATA\r\nVENCIMENTO";"DATA\r\nPAGAMENTO";"VALOR\r\nPAGO";"VALOR\r\nEM ABERTO";ESTADO\r\n1;FT-1;Hotel;2.337.912,00;9/20/2024;10/5/2024;10/22/2024;2.337.912,00;0,00;PAGO\r\n2;FT-2;Hotel;352.800,00;10/23/2024;11/7/2024;11/11/2024;650.000,00;-297.200,00;PAGO\r\n', "utf8");

test("lê CSV com título e cabeçalhos em várias linhas", () => {
  const matrix = parseCsv(decodeCsvBuffer(sample), ";");
  assert.equal(encontrarLinhaCabecalho(matrix), 1);
  const [headers, paid, overpaid] = matrix.slice(1);
  const rows = [paid, overpaid].map(cells => Object.fromEntries(headers.map((header, i) => [header, cells[i]])));
  const order = detectImportDateOrder(rows);
  assert.equal(order, "mdy");
  const first = readImportedInvoice(rows[0], order);
  assert.deepEqual([first.documentNumber, first.issueDate, first.dueDate, first.paymentDate], ["FT-1", "2024-09-20", "2024-10-05", "2024-10-22"]);
  assert.deepEqual([first.amount, first.paidAmount, first.openAmount, first.error], [2337912, 2337912, 0, undefined]);
  assert.match(readImportedInvoice(rows[1], order).error, /fora do valor/);
});

test("bloqueia estado PAGO incompatível com saldo em aberto", () => {
  const row = { "VALOR (Kz)": "100,00", "VALOR PAGO": "20,00", "VALOR EM ABERTO": "80,00", ESTADO: "PAGO" };
  assert.match(readImportedInvoice(row, "dmy").error, /contradiz/);
});

test("deixa estado desconhecido para revisão", () => {
  const row = { "VALOR (Kz)": "100,00", "VALOR PAGO": "0", "VALOR EM ABERTO": "100,00", ESTADO: "#VALOR!" };
  assert.match(readImportedInvoice(row, "mdy").error, /não reconhecido/);
});

test("não inventa valor pago para fatura marcada PAGO", () => {
  const row = { "VALOR (Kz)": "100,00", ESTADO: "PAGO" };
  assert.match(readImportedInvoice(row, "mdy").error, /sem valor pago/);
});

test("uma data de pagamento com ano corrompido fica para revisão", () => {
  const row = { "VALOR (Kz)": "100,00", "VALOR PAGO": "100,00", "VALOR EM ABERTO": "0", "DATA PAGAMENTO": "7/17/1905", ESTADO: "PAGO" };
  const result = readImportedInvoice(row, "mdy");
  assert.equal(result.paymentDate, "");
  assert.match(result.error, /Data de pagamento inválida/);
});
