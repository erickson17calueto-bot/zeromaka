export function parseImportAmount(value: string): number {
  const original = String(value ?? "").trim();
  let text = original.replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  const negative = text.startsWith("-") || /^\(.*\)$/.test(original);
  text = text.replace(/-/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = text.length - comma - 1;
    text = decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = text.length - dot - 1;
    if (decimals === 3 || (text.match(/\./g) || []).length > 1) text = text.replace(/\./g, "");
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.abs(negative ? -amount : amount) : 0;
}

export function isValidImportDate(value?: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function parseImportDate(value: string, order: "dmy" | "mdy" = "dmy"): string {
  const text = String(value ?? "").trim();
  let date = "";
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split(/[-/]/);
    date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(text)) {
    const [first, second, yearText] = text.split(/[-/]/);
    const year = yearText.length === 2 ? `20${yearText}` : yearText;
    const [day, month] = order === "mdy" ? [second, first] : [first, second];
    date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  } else {
    const serial = Number(text);
    if (Number.isInteger(serial) && serial > 20000 && serial < 70000) {
      date = new Date(Date.UTC(1899, 11, 30 + serial)).toISOString().slice(0, 10);
    }
  }
  return isValidImportDate(date) ? date : "";
}
