import { parseImportAmount, parseImportDate } from "./parse-values";

export type ImportDateOrder = "dmy" | "mdy";
export type ImportedInvoice = {
  issueDate: string;
  dueDate: string;
  paymentDate: string;
  documentNumber: string;
  description: string;
  amount: number;
  paidAmount: number;
  openAmount: number;
  sourceStatus: string;
  error?: string;
};

export function validateImportedInvoiceBalance(value: { amount?: number; paidAmount?: number; openAmount?: number; sourceStatus?: string }): string | undefined {
  const amount = Number(value.amount);
  const paid = Number(value.paidAmount);
  const open = Number(value.openAmount);
  if (!Number.isFinite(amount) || amount <= 0) return "Valor da fatura inválido";
  if (!Number.isFinite(paid) || !Number.isFinite(open) || paid < 0 || open < 0 || paid > amount || open > amount) {
    return "Pagamento ou saldo em aberto fora do valor da fatura";
  }
  if (Math.abs(amount - paid - open) > 0.01) return "Valor pago e saldo em aberto não somam o valor da fatura";
  const status = key(value.sourceStatus || "");
  if (status && !["pago", "liquidado", "pendente", "vencido", "parcial", "parcialmentepago", "emaberto", "paid", "open", "pending", "overdue", "partial", "partiallypaid"].includes(status)) {
    return "Estado da fatura não reconhecido; confirmar na revisão";
  }
  if (["pago", "liquidado", "paid"].includes(status) && open > 0.01) return "Estado pago contradiz o saldo em aberto";
  if (status.includes("vencid") && open <= 0.01) return "Estado vencido sem saldo em aberto";
  return undefined;
}

const key = (text: string) => String(text || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function invoiceField(raw: Record<string, string>, aliases: string[]): string {
  const wanted = new Set(aliases.map(key));
  const found = Object.entries(raw).find(([name]) => wanted.has(key(name)));
  return String(found?.[1] ?? "").trim();
}

export function detectImportDateOrder(rows: Record<string, string>[]): ImportDateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const row of rows.slice(0, 150)) {
    for (const [header, value] of Object.entries(row)) {
      if (!key(header).includes("data") && !key(header).includes("date")) continue;
      const match = /^(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}$/.exec(String(value).trim());
      if (!match) continue;
      const first = Number(match[1]);
      const second = Number(match[2]);
      if (first > 12 && second <= 12) dmy++;
      if (second > 12 && first <= 12) mdy++;
    }
  }
  return mdy > dmy ? "mdy" : "dmy";
}

function signedAmount(text: string): number {
  const value = parseImportAmount(text);
  return /^\s*-/.test(text) || /^\s*\(/.test(text) ? -value : value;
}

function invoiceDate(text: string, order: ImportDateOrder): string {
  const parsed = parseImportDate(text, order);
  return parsed && Number(parsed.slice(0, 4)) >= 2000 && Number(parsed.slice(0, 4)) <= 2100 ? parsed : "";
}

export function readImportedInvoice(raw: Record<string, string>, order: ImportDateOrder): ImportedInvoice {
  const amountText = invoiceField(raw, ["VALOR (Kz)", "Valor da fatura", "Valor total", "Total", "Montante", "Valor"]);
  const paidText = invoiceField(raw, ["VALOR PAGO", "Valor recebido", "Pago", "Recebido"]);
  const openText = invoiceField(raw, ["VALOR EM ABERTO", "Valor pendente", "Saldo em aberto", "Saldo pendente"]);
  const amount = parseImportAmount(amountText);
  const hasPaid = paidText !== "" && paidText !== "—";
  const hasOpen = openText !== "" && openText !== "—";
  const paid = hasPaid ? signedAmount(paidText) : hasOpen ? amount - signedAmount(openText) : 0;
  const open = hasOpen ? signedAmount(openText) : amount - paid;
  const sourceStatus = invoiceField(raw, ["ESTADO", "Status", "Situação"]);
  const statusKey = key(sourceStatus);
  const issueText = invoiceField(raw, ["DATA ENTRADA FATURA", "DATA EMISSÃO", "EMISSÃO", "DATA FATURA"]);
  const dueText = invoiceField(raw, ["DATA VENCIMENTO", "VENCIMENTO"]);
  const paymentText = invoiceField(raw, ["DATA PAGAMENTO", "DATA RECEBIMENTO"]);
  const paymentDate = invoiceDate(paymentText, order);
  let error: string | undefined;
  if (!amountText || amount <= 0) error = "Valor da fatura inválido";
  else if (!hasPaid && !hasOpen && statusKey.includes("pag")) error = "Fatura marcada como paga sem valor pago ou saldo verificável";
  else error = validateImportedInvoiceBalance({ amount, paidAmount: paid, openAmount: open, sourceStatus });
  if (!error && paymentText && paymentText !== "—" && !paymentDate) error = "Data de pagamento inválida; confirmar na revisão";
  return {
    issueDate: invoiceDate(issueText, order),
    dueDate: invoiceDate(dueText, order),
    paymentDate,
    documentNumber: invoiceField(raw, ["Nº FATURA", "NÚMERO FATURA", "NUMERO FATURA", "FATURA", "FACTURA"]),
    description: invoiceField(raw, ["DESCRIÇÃO / SERVIÇO", "DESCRIÇÃO", "SERVIÇO", "DESCRICAO"]),
    amount, paidAmount: paid, openAmount: open, sourceStatus, error,
  };
}
