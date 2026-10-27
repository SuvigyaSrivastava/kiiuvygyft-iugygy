import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type Controls, selectionParams } from "./controls";
import type { Accuracy, CalibrationResp, Decision, Meta, Month, Quality, Sensitivity } from "./types";

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export function apiUrl(path: string, params: Params = {}): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return `${BASE}${path}${s ? `?${s}` : ""}`;
}

async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path, params), { signal });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { loc?: string[]; msg: string }) => `${d.loc?.slice(-1)[0] ?? "input"}: ${d.msg}`).join("; ");
    } catch {
      /* keep generic message */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

const keep = { placeholderData: keepPreviousData, staleTime: 5 * 60_000 } as const;

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: ({ signal }) => get<Meta>("/api/meta", {}, signal), staleTime: Infinity });

export const useDecision = (c: Controls) =>
  useQuery({
    queryKey: ["decision", c.day, c.mode, c.cutoff, c.lead, c.interp, c.ratio, c.hindsight, c.demand],
    queryFn: ({ signal }) =>
      get<Decision>("/api/decision", { delivery_day: c.day, ...selectionParams(c), ratio: c.ratio, hindsight: c.hindsight, include_actual: c.hindsight, flat_demand_mw: c.demand || undefined }, signal),
    ...keep,
  });

export const useAccuracy = (c: Controls) =>
  useQuery({ queryKey: ["accuracy", c.scope, c.mode, c.cutoff, c.lead, c.interp], queryFn: ({ signal }) => get<Accuracy>("/api/accuracy", { scope: c.scope, ...selectionParams(c) }, signal), ...keep });

export const useSensitivity = (c: Controls, cutoffs: string[]) =>
  useQuery({
    queryKey: ["sensitivity", c.scope, c.interp, c.cutoff, cutoffs.join(",")],
    queryFn: ({ signal }) => get<Sensitivity>("/api/sensitivity", { scope: c.scope, interp: c.interp, hindsight_cutoff: c.cutoff, cutoffs: cutoffs.join(",") }, signal),
    ...keep,
  });

export const useQuality = (c: Controls) =>
  useQuery({ queryKey: ["quality", c.scope, c.mode, c.cutoff, c.lead, c.interp], queryFn: ({ signal }) => get<Quality>("/api/quality", { scope: c.scope, ...selectionParams(c) }, signal), ...keep });

export const useCalibration = (c: Controls) =>
  useQuery({
    queryKey: ["calibration", c.scope, c.mode, c.cutoff, c.lead, c.interp, c.ratio],
    queryFn: ({ signal }) => get<CalibrationResp>("/api/calibration", { scope: c.scope, ratio: c.ratio, ...selectionParams(c) }, signal),
    ...keep,
  });

export const useReceiptHeader = (c: Controls) =>
  useQuery({
    queryKey: ["receipt", c.day, c.mode, c.cutoff, c.lead, c.interp],
    queryFn: ({ signal }) => get<{ input_rows_sha256: string; row_count: number; snapshot_id: string; git_commit: string; decision_timestamp_utc: string }>("/api/receipt", { delivery_day: c.day, ...selectionParams(c) }, signal),
    ...keep,
  });

export function receiptUrl(c: Controls, format: "json" | "csv"): string {
  return apiUrl("/api/receipt", { delivery_day: c.day, ...selectionParams(c), format });
}

export const useMonth = (c: Controls) =>
  useQuery({
    queryKey: ["month", c.scope, c.mode, c.cutoff, c.lead, c.interp],
    queryFn: ({ signal }) => get<Month>("/api/month", { scope: c.scope, ...selectionParams(c) }, signal),
    ...keep,
  });
