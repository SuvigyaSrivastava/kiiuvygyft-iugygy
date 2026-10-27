const LONDON = "Europe/London";
const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dash = "n/a";

export function fmtInt(x: number | null | undefined): string {
  return x == null || Number.isNaN(x) ? dash : nf0.format(Math.round(x));
}
export function fmtMW(x: number | null | undefined, signed = false): string {
  if (x == null || Number.isNaN(x)) return dash;
  const s = nf0.format(Math.abs(Math.round(x)));
  const sign = x < 0 ? "-" : signed && Math.round(x) > 0 ? "+" : "";
  return `${sign}${s} MW`;
}
export function fmtGW(x: number | null | undefined, signed = false): string {
  if (x == null || Number.isNaN(x)) return dash;
  const g = x / 1000;
  const s = nf1.format(Math.abs(g));
  const sign = g < 0 && s !== "0.0" ? "-" : signed && s !== "0.0" ? "+" : "";
  return `${sign}${s} GW`;
}
export function fmtGWFromGW(g: number): string {
  return fmtGW(g * 1000);
}
export function fmtMWh(x: number | null | undefined): string {
  return x == null || Number.isNaN(x) ? dash : `${nf0.format(Math.round(x))} MWh`;
}
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return dash;
  return `${(x * 100).toFixed(digits)}%`;
}
export function fmtRatio(x: number): string {
  return nf2.format(x).replace(/\.00$/, "");
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dayShortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit", hour12: false });
const stampFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** `2026-01-15` -> `Thu 15 Jan 2026`. A plain date has no zone, so it is read at noon UTC. */
export function fmtDay(iso: string): string {
  return dayFmt.format(new Date(`${iso}T12:00:00Z`)).replace(",", "");
}
export function fmtDayShort(iso: string): string {
  return dayShortFmt.format(new Date(`${iso}T12:00:00Z`)).replace(",", "");
}
export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
export function fmtStamp(iso: string): string {
  return stampFmt.format(new Date(iso)).replace(",", "");
}
export function fmtUtcStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
export function previousDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
