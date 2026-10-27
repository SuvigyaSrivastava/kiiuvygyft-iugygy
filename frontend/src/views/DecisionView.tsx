import { useEffect, useMemo, useState } from "react";
import { receiptUrl, useDecision, useMonth, useReceiptHeader } from "../api";
import { Chart } from "../components/Chart";
import { Timeline } from "../components/Timeline";
import { Disclosure, ErrorBlock, Stat } from "../components/ui";
import { coverChart, decisionChart } from "../charts";
import type { Controls } from "../controls";
import { fmtDay, fmtGW, fmtGWFromGW, fmtInt, fmtMW, fmtMWh, fmtPct, fmtStamp, fmtTime, previousDay, summaryText } from "../format";
import type { Decision } from "../types";
import type { Tokens } from "../theme";

interface Props {
  c: Controls;
  set: (p: Partial<Controls>) => void;
  tokens: Tokens;
}

function Skeleton() {
  return (
    <div className="skel" role="status" aria-label="Loading the forecast">
      <div className="skel-h" />
      <div className="skel-p" />
      <div className="skel-row"><i /><i /><i /></div>
      <div className="skel-chart" />
    </div>
  );
}

function DayChart({ d, c, tokens }: { d: Decision; c: Controls; tokens: Tokens }) {
  const win = d.summary.low_wind_window;
  const option = useMemo(
    () => decisionChart(tokens, d.points, { showActual: c.hindsight, showHindsight: c.hindsight, lowWindow: win ? { start: win.start, end: win.end } : null }),
    [tokens, d.points, c.hindsight, win],
  );
  return <Chart option={option} height={340} label={`Wind forecast for ${fmtDay(d.delivery_day)} in megawatts, half-hourly`} />;
}

function CoverChart({ d, tokens }: { d: Decision; tokens: Tokens }) {
  const option = useMemo(() => coverChart(tokens, d.points), [tokens, d.points]);
  return <Chart option={option} height={210} label="Suggested extra cover in megawatts, half-hourly" />;
}

function CopyButton({ label, text }: { label: string; text: () => string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  const run = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setDone(true);
    } catch {
      window.prompt("Copy this text", text());
    }
  };
  return (
    <button type="button" className="ghost" onClick={run}>
      {done ? "Copied" : label}
    </button>
  );
}

function ReceiptRow({ c }: { c: Controls }) {
  const r = useReceiptHeader(c);
  if (r.isPending) return <p className="hint">Preparing the receipt...</p>;
  if (r.isError) return <p className="hint">The receipt could not be built for this day.</p>;
  return (
    <>
      <p className="prose">A fingerprint of the exact forecast rows behind this decision. Run <code>scripts/verify_receipt.py</code> against the raw data to check it.</p>
      <dl className="kv">
        <dt>Rows</dt><dd>{r.data.row_count}</dd>
        <dt>SHA-256</dt><dd><code>{r.data.input_rows_sha256}</code></dd>
        <dt>Snapshot</dt><dd><code>{r.data.snapshot_id}</code></dd>
      </dl>
      <p className="row">
        <a className="btn" href={receiptUrl(c, "json")} download>Download JSON</a>
        <a className="btn" href={receiptUrl(c, "csv")} download>Download CSV</a>
      </p>
    </>
  );
}

export function DecisionView({ c, set, tokens }: Props) {
  const q = useDecision(c);
  const month = useMonth(c);
  const dayList = month.data?.days.map((x) => x.delivery_day) ?? [];
  const idx = dayList.indexOf(c.day);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && idx > 0) set({ day: dayList[idx - 1] });
      if (e.key === "ArrowRight" && idx >= 0 && idx < dayList.length - 1) set({ day: dayList[idx + 1] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, dayList, set]);

  if (q.isPending) return <Skeleton />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const s = d.summary;
  const hasBand = d.points.some((p) => p.band_low_mw != null);
  const used = d.vintages.map((v) => fmtStamp(v.publish_time)).join(" and ");
  const next = d.timeline.next_vintage_after_decision;
  const leadMode = c.mode === "lead";
  const pct = fmtPct(d.target_quantile, 0);

  return (
    <div className={q.isFetching ? "view is-stale" : "view"}>
      <header className="answer">
        <h1>Plan for {fmtGWFromGW(s.mean_gw)} of wind on {fmtDay(d.delivery_day)}</h1>
        <p>
          {leadMode ? (
            <>Each half-hour uses the latest forecast issued at least {c.lead} hours before it.</>
          ) : (
            <>
              Based on the forecast issued {used}, the latest before the {fmtTime(d.decision_timestamp)} cutoff on {fmtDay(previousDay(d.delivery_day))}.
            </>
          )}
        </p>
        <div className="actions">
          <CopyButton
            label="Copy summary"
            text={() =>
              summaryText({
                day: d.delivery_day, meanGw: s.mean_gw, minGw: s.min_gw, maxGw: s.max_gw,
                lowStart: s.low_wind_window?.start, lowEnd: s.low_wind_window?.end, lowMw: s.low_wind_window?.mean_mw,
                coverMwh: s.total_cover_mwh, quantile: d.target_quantile,
                issued: d.vintages[0]?.publish_time ?? d.decision_timestamp,
                cutoff: leadMode ? undefined : fmtTime(d.decision_timestamp), lead: leadMode ? c.lead : undefined,
              })
            }
          />
          <CopyButton label="Copy link" text={() => window.location.href} />
        </div>
      </header>

      <dl className="stats">
        <Stat label="Range over the day" value={`${fmtGWFromGW(s.min_gw)} to ${fmtGWFromGW(s.max_gw)}`} />
        <Stat
          label="Lowest three hours"
          value={s.low_wind_window ? `${fmtTime(s.low_wind_window.start)} to ${fmtTime(s.low_wind_window.end)}` : "n/a"}
          note={s.low_wind_window ? `averaging ${fmtGW(s.low_wind_window.mean_mw)}` : undefined}
        />
        <Stat
          label={`Extra cover, enough ${pct} of the time`}
          value={s.total_cover_mwh != null ? fmtMWh(s.total_cover_mwh) : "No band yet"}
          note={s.highest_cover_window ? `most needed ${fmtTime(s.highest_cover_window.start)} to ${fmtTime(s.highest_cover_window.end)}` : d.band_status}
        />
      </dl>

      <figure className="plot">
        <DayChart d={d} c={c} tokens={tokens} />
        <figcaption>
          {hasBand
            ? `The shaded range is where actual wind has usually landed, from errors on ${d.history_days} earlier days.`
            : `No range yet: ${d.band_status}. The forecast is shown without a band rather than a guessed one.`}
        </figcaption>
      </figure>

      {c.hindsight && d.day_metrics && (
        <p className="callout">
          In hindsight this forecast missed actual wind by {fmtMW(d.day_metrics.mae)} on average. Bias was {fmtMW(d.day_metrics.bias, true)}; positive means too high.
        </p>
      )}

      <div className="discs">
        {hasBand && (
          <Disclosure title="Extra cover by half-hour">
            <CoverChart d={d} tokens={tokens} />
          </Disclosure>
        )}

        <Disclosure title="How this forecast was picked" note={leadMode ? undefined : `issued ${used}`}>
          {leadMode ? (
            <p className="prose">Each half-hour takes the newest forecast that was published at least {c.lead} hours before that half-hour began.</p>
          ) : (
            <>
              <p className="prose">
                Only forecasts published before the cutoff count.{next ? <> The next one arrives at {fmtStamp(next)}, too late for this decision.</> : null}
              </p>
              <Timeline tl={d.timeline} tokens={tokens} />
            </>
          )}
        </Disclosure>

        <Disclosure title="How the extra cover is set">
          <p className="prose">
            A shortfall costs {c.ratio} times a surplus, so the cover is enough in {pct} of half-hours. For each half-hour it is the {pct} point of how far past forecasts ran above actual wind, at a similar forecast level, never below zero. A forecast that is too high leaves you short, so that side sets the cover.
          </p>
        </Disclosure>

        <Disclosure title="Compare with your demand" note="optional">
          <div className="demand">
            <label htmlFor="demand">Flat demand</label>
            <span className="inline-input">
              <input id="demand" type="number" min={0} step={100} inputMode="numeric" placeholder="e.g. 20000" value={c.demand} onChange={(e) => set({ demand: e.target.value })} />
              <span className="unit">MW</span>
            </span>
          </div>
          <p className="hint">
            {d.remaining_need_mw != null ? `Left for thermal plants: ${fmtMW(d.remaining_need_mw)} on average, after the forecast and the extra cover. Illustrative, from your figure.` : "Enter a figure to see what is left for thermal plants. It is your number, not data."}
          </p>
        </Disclosure>

        <Disclosure title="Decision receipt" note="for audit">
          <ReceiptRow c={c} />
        </Disclosure>

        <Disclosure title="Half-hour table">
            <div className="table-scroll"><table className="data">
              <thead>
                <tr>
                  <th scope="col">Half-hour (London)</th>
                  <th scope="col" className="num">Forecast</th>
                  <th scope="col" className="num">P10</th>
                  <th scope="col" className="num">P90</th>
                  <th scope="col" className="num">Extra cover</th>
                  <th scope="col">Forecast issued</th>
                </tr>
              </thead>
              <tbody>
                {d.points.map((p) => (
                  <tr key={p.t}>
                    <th scope="row">{fmtTime(p.t)}</th>
                    <td className="num">{fmtInt(p.forecast_mw)} MW</td>
                    <td className="num">{p.band_low_mw == null ? "n/a" : `${fmtInt(p.band_low_mw)} MW`}</td>
                    <td className="num">{p.band_high_mw == null ? "n/a" : `${fmtInt(p.band_high_mw)} MW`}</td>
                    <td className="num">{p.cover_mw == null ? "n/a" : `${fmtInt(p.cover_mw)} MW`}</td>
                    <td>{fmtStamp(p.publish_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
        </Disclosure>
      </div>
    </div>
  );
}
