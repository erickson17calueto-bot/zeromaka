// Formatadores seguros no servidor (sem dependência do browser).
// NB: os totais chegam já calculados em numeric pelo PostgreSQL — aqui apenas
// formatamos números pré-calculados; nunca re-totalizamos valores críticos.

export function fmtMoney(v: number, opts?: { parensNegative?: boolean }): string {
  const n = typeof v === "number" && isFinite(v) ? v : 0;
  const abs = Math.abs(n).toLocaleString("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0 && opts?.parensNegative !== false) return `(${abs})`;
  return abs;
}

export function fmtDatePt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Percentagem sem Infinity/NaN
export function fmtPercentChange(current: number, previous: number): string {
  if (!previous || previous === 0) return current === 0 ? "0%" : "—";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!isFinite(pct)) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// Torna um pedaço de texto seguro para nome de ficheiro
export function safeFilePart(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "org";
}

export function exportFileName(company: string, report: string, start: string, end: string, version: number, ext: string): string {
  return `zeromaka_${safeFilePart(company)}_${safeFilePart(report)}_${start}_${end}_v${version}.${ext}`;
}

// Anti-formula-injection para Excel: prefixa apóstrofo em textos que começam por = + - @
export function excelSafeText(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
