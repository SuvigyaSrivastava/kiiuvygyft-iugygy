import type { ReactNode } from "react";
import { fmtMW, fmtPct } from "../format";
import type { Metrics } from "../types";

export function Loading({ what }: { what: string }) {
  return (
    <p className="state" role="status">
      Loading {what}...
    </p>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="state state-error" role="alert">
      <p>{msg}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Stat({ label, value, note, hero = false }: { label: string; value: ReactNode; note?: ReactNode; hero?: boolean }) {
  return (
    <div className={hero ? "stat stat-hero" : "stat"}>
      <dt>{label}</dt>
      <dd className="stat-value">{value}</dd>
      {note && <dd className="stat-note">{note}</dd>}
    </div>
  );
}

export function Section({ title, hint, children, id }: { title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id ? `${id}-h` : undefined}>
      <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

export function TableView({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="table-view">
      <summary>{summary}</summary>
      <div className="table-scroll">{children}</div>
    </details>
  );
}

export function metricRows(m: Metrics): [string, string][] {
  return [
    ["Mean absolute error (MAE)", fmtMW(m.mae)],
    ["Root mean square error (RMSE)", fmtMW(m.rmse)],
    ["Bias (mean error)", fmtMW(m.bias, true)],
    ["WAPE (sum of absolute error / sum of actual)", fmtPct(m.wape)],
    ["Median absolute error (P50)", fmtMW(m.p50_abs)],
    ["P90 absolute error", fmtMW(m.p90_abs)],
    ["P95 absolute error", fmtMW(m.p95_abs)],
  ];
}

export function MetricsByTable({ rows, first }: { rows: { label: string; n: number; mae: number | null; rmse: number | null; bias: number | null; p90_abs: number | null }[]; first: string }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th scope="col">{first}</th>
          <th scope="col" className="num">Half-hours</th>
          <th scope="col" className="num">MAE</th>
          <th scope="col" className="num">RMSE</th>
          <th scope="col" className="num">Bias</th>
          <th scope="col" className="num">P90 abs error</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td className="num">{r.n.toLocaleString("en-GB")}</td>
            <td className="num">{fmtMW(r.mae)}</td>
            <td className="num">{fmtMW(r.rmse)}</td>
            <td className="num">{fmtMW(r.bias, true)}</td>
            <td className="num">{fmtMW(r.p90_abs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
