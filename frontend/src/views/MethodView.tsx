import { receiptUrl, useCalibration, useDecision, useMeta, useQuality, useReceiptHeader } from "../api";
import { Chart } from "../components/Chart";
import { Timeline } from "../components/Timeline";
import { ErrorBlock, Loading, Section, Stat } from "../components/ui";
import { calibrationChart } from "../charts";
import type { Controls } from "../controls";
import { fmtDay, fmtDayShort, fmtInt, fmtMW, fmtMWh, fmtPct, fmtUtcStamp } from "../format";
import type { Tokens } from "../theme";

export function MethodView({ c, tokens }: { c: Controls; tokens: Tokens }) {
  const meta = useMeta();
  const quality = useQuality(c);
  const cal = useCalibration(c);
  const dec = useDecision(c);
  const rec = useReceiptHeader(c);

  if (quality.isPending || cal.isPending) return <Loading what="data checks" />;
  if (quality.isError) return <ErrorBlock error={quality.error} onRetry={() => quality.refetch()} />;
  if (cal.isError) return <ErrorBlock error={cal.error} onRetry={() => cal.refetch()} />;
  const qd = quality.data;
  const cd = cal.data;
  const m = meta.data;
  const perDayBad = qd.per_day.filter((d) => d.periods !== d.expected).length;

  return (
    <div className="view">
      <header className="lede">
        <h1>Where the numbers come from</h1>
        <p>Everything on the other screens is computed from a saved copy of two Elexon datasets. This page lists what was checked, what was assumed, and how to verify a decision.</p>
      </header>

      <Section title="The forecast timeline for the chosen day" id="timeline">
        {dec.data ? <Timeline tl={dec.data.timeline} tokens={tokens} /> : <Loading what="the timeline" />}
      </Section>

      <Section title="Data quality" id="quality" hint="Checked on the saved snapshot for the delivery days in scope.">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col" className="num">Result</th>
                <th scope="col">What it means</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Actual half-hours present</th><td className="num">{fmtInt(qd.actuals_rows)}</td><td>{perDayBad === 0 ? `All ${qd.per_day.length} days have every period (48 in a normal day).` : `${perDayBad} days are incomplete.`}</td></tr>
              <tr><th scope="row">Missing actual periods</th><td className="num">{fmtInt(qd.missing_periods)}</td><td>Expected periods with no FUELHH row.</td></tr>
              <tr><th scope="row">Duplicate actual periods</th><td className="num">{fmtInt(qd.duplicate_periods)}</td><td>More than one FUELHH row for the same start time.</td></tr>
              <tr><th scope="row">Zero or negative actuals</th><td className="num">{fmtInt(qd.nonpositive_actuals)}</td><td>Wind output of zero or less would be suspect.</td></tr>
              <tr><th scope="row">Actuals published late</th><td className="num">{fmtInt(qd.late_published_actuals)}</td><td>Published more than an hour after the period ended. Flagged and excluded from the second metric column.</td></tr>
              <tr><th scope="row">Forecast resolution</th><td className="num">{qd.forecast_resolution_minutes} min</td><td>WINDFOR is hourly. Each value is applied to both half-hours, or interpolated if you choose.</td></tr>
              <tr><th scope="row">Forecast issues</th><td className="num">{fmtInt(qd.forecast_vintages)}</td><td>Usually at {qd.usual_publish_times_utc.join(", ")} UTC. January UTC equals London time.</td></tr>
              <tr><th scope="row">Irregular publish times</th><td className="num">{qd.irregular_publish_times.length}</td><td>{qd.irregular_publish_times.length ? qd.irregular_publish_times.map((t) => fmtUtcStamp(t)).join("; ") : "None."}</td></tr>
              <tr><th scope="row">Duplicate forecast rows</th><td className="num">{fmtInt(qd.forecast_duplicate_rows)}</td><td>Same start time and publish time twice.</td></tr>
              <tr><th scope="row">Half-hours with no forecast before the cutoff</th><td className="num">{fmtPct(qd.targets_without_forecast_share)}</td><td>Such half-hours would be left out and counted here.</td></tr>
            </tbody>
          </table>
        </div>
        <p className="hint">Headline error with all periods: MAE {fmtMW(qd.headline.mae)}. Without flagged periods: MAE {fmtMW(qd.headline_excluding_flagged.mae)} over {fmtInt(qd.headline_excluding_flagged.n)} of {fmtInt(qd.headline.n)} half-hours.</p>
      </Section>

      <Section title="Limits of this comparison" id="caveats">
        <ul className="plain">
          {qd.caveats.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Section>

      <Section title="Assumptions" id="assumptions">
        <ul className="plain">
          {qd.assumptions.map((t) => (
            <li key={t}>{t}</li>
          ))}
          {m?.gate_closure_sources.map((g) => (
            <li key={g.name}>Gate closure, {g.name}: {g.note}. <a href={g.url} target="_blank" rel="noreferrer">Source</a> (read 27 Oct 2026).</li>
          ))}
        </ul>
      </Section>

      <Section title="Is the range honest?" id="calibration" hint={cd.finding}>
        <dl className="stats">
          <Stat label="Nominal coverage" value="80%" note="P10 to P90 band" />
          <Stat label="Out-of-sample coverage" value={fmtPct(cd.calibration.coverage)} note={`${fmtInt(cd.calibration.n)} half-hours, ${cd.calibration.days_scored} days`} />
          <Stat label="Below the band" value={fmtPct(cd.calibration.below)} note="Actual wind lower than the range" />
          <Stat label="Above the band" value={fmtPct(cd.calibration.above)} note="Actual wind higher than the range" />
        </dl>
        <Chart option={calibrationChart(tokens, cd)} height={260} label="Share of half-hours inside the range, by delivery day" />
        <p className="hint">
          Weakest days: {cd.calibration.worst_days.slice(0, 3).map((d) => `${fmtDayShort(d.delivery_day)} (${fmtPct(d.coverage, 0)} inside, ${fmtPct(d.below, 0)} below)`).join("; ")}. Those are days when wind came in far under the forecast and past errors had not prepared the band for it.
        </p>
        <p className="hint">{cd.calibration.days_without_band} days at the start have no range because fewer than {cd.min_history_days} earlier days were available. Nothing is shown for them.</p>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Forecast level</th>
              <th scope="col" className="num">Half-hours</th>
              <th scope="col" className="num">Inside</th>
              <th scope="col" className="num">Below</th>
              <th scope="col" className="num">Above</th>
            </tr>
          </thead>
          <tbody>
            {cd.calibration.by_bucket.map((b) => (
              <tr key={b.bucket}>
                <th scope="row">{b.bucket}</th>
                <td className="num">{fmtInt(b.n)}</td>
                <td className="num">{fmtPct(b.coverage)}</td>
                <td className="num">{fmtPct(b.below)}</td>
                <td className="num">{fmtPct(b.above)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="What the cover rule would have done" id="backtest" hint="Out of sample, for each cost ratio. Energy is megawatts times half an hour. No prices are used, so there is no pound figure.">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Cost of short / surplus</th>
                <th scope="col" className="num">Cover aims at</th>
                <th scope="col" className="num">Half-hours still short</th>
                <th scope="col" className="num">Extra bought</th>
                <th scope="col" className="num">Extra unused</th>
                <th scope="col" className="num">Shortfall left</th>
              </tr>
            </thead>
            <tbody>
              {cd.cover_curve.map((r) => (
                <tr key={r.ratio} className={r.ratio === cd.chosen.ratio ? "picked" : ""}>
                  <th scope="row">{r.ratio}</th>
                  <td className="num">{fmtPct(r.target_quantile, 0)}</td>
                  <td className="num">{fmtPct(r.share_short)}</td>
                  <td className="num">{fmtMWh(r.extra_mwh_bought)}</td>
                  <td className="num">{fmtMWh(r.extra_mwh_unused)}</td>
                  <td className="num">{fmtMWh(r.remaining_shortfall_mwh)}</td>
                </tr>
              ))}
              {!cd.cover_curve.some((r) => r.ratio === cd.chosen.ratio) && (
                <tr className="picked">
                  <th scope="row">{cd.chosen.ratio} (yours)</th>
                  <td className="num">{fmtPct(cd.chosen.target_quantile, 0)}</td>
                  <td className="num">{fmtPct(cd.chosen.share_short)}</td>
                  <td className="num">{fmtMWh(cd.chosen.extra_mwh_bought)}</td>
                  <td className="num">{fmtMWh(cd.chosen.extra_mwh_unused)}</td>
                  <td className="num">{fmtMWh(cd.chosen.remaining_shortfall_mwh)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Decision receipt" id="receipt" hint={`For ${fmtDay(c.day)} with the settings in the bar above. It lists every half-hour with the exact forecast issue used, the actual, the snapshot and a hash anyone can recompute.`}>
        <div className="row">
          <a className="btn" href={receiptUrl(c, "json")} download>Download JSON</a>
          <a className="btn" href={receiptUrl(c, "csv")} download>Download CSV</a>
        </div>
        {rec.data && (
          <dl className="kv">
            <dt>Rows</dt><dd>{rec.data.row_count}</dd>
            <dt>SHA-256 of rows</dt><dd className="mono">{rec.data.input_rows_sha256}</dd>
            <dt>Snapshot</dt><dd className="mono">{rec.data.snapshot_id}</dd>
            <dt>Code commit</dt><dd className="mono">{rec.data.git_commit}</dd>
          </dl>
        )}
        <p className="hint">To check it: <code className="mono">python scripts/verify_receipt.py receipt_{c.day}_{c.cutoff.replace(":", "")}.json</code></p>
      </Section>

      <Section title="Data snapshot" id="snapshot">
        {m ? (
          <dl className="kv">
            <dt>Snapshot id</dt><dd className="mono">{m.snapshot.snapshot_id}</dd>
            <dt>Fetched</dt><dd>{m.snapshot.fetched_at_utc ? fmtUtcStamp(m.snapshot.fetched_at_utc) : "n/a"}</dd>
            <dt>Source</dt><dd className="mono">{m.snapshot.api_base}</dd>
            <dt>Rows</dt><dd>{Object.entries(m.snapshot.rows).map(([k, v]) => `${k}: ${fmtInt(v)}`).join(", ")}</dd>
            <dt>Code commit</dt><dd className="mono">{m.git_commit}</dd>
            <dt>Refresh</dt><dd><code className="mono">python scripts/fetch_data.py</code></dd>
            <dt>Delivery days</dt><dd>{fmtDayShort(m.delivery_days[c.scope][0])} to {fmtDayShort(m.delivery_days[c.scope].slice(-1)[0])}</dd>
          </dl>
        ) : (
          <Loading what="snapshot details" />
        )}
        <p className="hint">The app never calls Elexon while you use it. Refreshing the snapshot is a separate step that pulls from the live API and checks row counts.</p>
      </Section>
    </div>
  );
}
