export function formatMoney(cents: number | null | undefined, opts: { sign?: boolean } = {}) {
  const n = (cents ?? 0) / 100;
  const formatted = n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (opts.sign && n > 0) return "+" + formatted;
  return formatted;
}

export function parseMoneyInput(value: string): number {
  // Returns cents
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function formatPercent(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDate(d: Date | string | number | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (d == null) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, opts ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d: Date | string | number | null | undefined) {
  if (d == null) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatHours(minutes: number) {
  if (!minutes) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ymd(d: Date = new Date()) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
