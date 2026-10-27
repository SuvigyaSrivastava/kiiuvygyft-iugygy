import type { Scope } from "./types";

export type View = "decision" | "accuracy" | "sensitivity" | "method";
export const VIEWS: { id: View; label: string }[] = [
  { id: "decision", label: "Decision" },
  { id: "accuracy", label: "Accuracy" },
  { id: "sensitivity", label: "Cutoff sensitivity" },
  { id: "method", label: "Data and method" },
];

export interface Controls {
  view: View;
  scope: Scope;
  day: string;
  mode: "cutoff" | "lead";
  cutoff: string;
  lead: number;
  ratio: number;
  hindsight: boolean;
  interp: "hold" | "linear";
  demand: string;
}

export const DEFAULTS: Controls = {
  view: "decision",
  scope: "decision_in_january",
  day: "2026-01-15",
  mode: "cutoff",
  cutoff: "09:20",
  lead: 24,
  ratio: 3,
  hindsight: false,
  interp: "hold",
  demand: "",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCutoff(s: string): boolean {
  return HHMM.test(s);
}

function num(v: string | null, fallback: number, lo: number, hi: number): number {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}

export function fromSearch(search: string): Controls {
  const q = new URLSearchParams(search);
  const view = q.get("view");
  const scope = q.get("scope");
  const day = q.get("day");
  const cutoff = q.get("cutoff");
  return {
    view: VIEWS.some((v) => v.id === view) ? (view as View) : DEFAULTS.view,
    scope: scope === "delivery_in_january" ? "delivery_in_january" : DEFAULTS.scope,
    day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : DEFAULTS.day,
    mode: q.get("mode") === "lead" ? "lead" : "cutoff",
    cutoff: cutoff && isCutoff(cutoff) ? cutoff : DEFAULTS.cutoff,
    lead: num(q.get("lead"), DEFAULTS.lead, 0, 48),
    ratio: num(q.get("ratio"), DEFAULTS.ratio, 0.05, 100),
    hindsight: q.get("hindsight") === "1",
    interp: q.get("interp") === "linear" ? "linear" : "hold",
    demand: q.get("demand") && Number(q.get("demand")) > 0 ? String(q.get("demand")) : "",
  };
}

export function toSearch(c: Controls): string {
  const q = new URLSearchParams();
  (Object.keys(DEFAULTS) as (keyof Controls)[]).forEach((k) => {
    const v = c[k];
    if (v !== DEFAULTS[k]) q.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  });
  return q.toString();
}

/** Parameters shared by every endpoint that depends on how a forecast is selected. */
export function selectionParams(c: Controls): Record<string, string | number> {
  return { mode: c.mode, cutoff: c.cutoff, lead_hours: c.lead, interp: c.interp };
}

export function selectionLabel(c: Controls): string {
  return c.mode === "cutoff" ? `cutoff ${c.cutoff}` : `at least ${c.lead} h ahead`;
}

/** Probability that the suggested cover is enough, from the cost ratio r = shortfall cost / surplus cost. */
export function targetQuantile(ratio: number): number {
  return ratio / (1 + ratio);
}
