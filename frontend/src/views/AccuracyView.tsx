import { useAccuracy } from "../api";
import { Chart } from "../components/Chart";
import { ErrorBlock, Loading, MetricsByTable, Section, Stat, TableView, metricRows } from "../components/ui";
import { histogramChart, hourChart, leadChart, seriesChart } from "../charts";
import { type Controls, selectionLabel } from "../controls";
import { fmtDay, fmtInt, fmtMW, fmtPct } from "../format";
import type { Tokens } from "../theme";

export function AccuracyView({ c, tokens }: { c: Controls; tokens: Tokens }) {
  const q = useAccuracy(c);
  if (q.isPending) return <Loading what="accuracy results" />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  const h = a.headline;
  const hx = a.headline_excluding_flagged;
  const hRows = metricRows(h);
  const hxRows = metricRows(hx);
  const over = a.histogram.filter((b) => b.from_mw >= 0).reduce((s, b) => s + b.count, 0);
  const total = a.histogram.reduce((s, b) => s + b.count, 0);
  const worst = a.worst_days[0];
  const leadRange = a.by_horizon.length ? { from: Math.min(...a.by_horizon.map((r) => parseInt(r.label, 10) || 0)), to: 42 } : null;

  return (
    <div className={q.isFetching ? "view is-stale" : "view"}>
      <header className="lede">
        <h1>How far off the forecast was in January</h1>
        <p>
          {fmtInt(h.n)} half-hours over {a.delivery_days} delivery days, using the forecast available at {selectionLabel(c)}. Error is forecast minus actual, so a positive number means the forecast was too high and the buyer was left short.
        </p>
      </header>

      <dl className="stats">
        <Stat hero label="Mean absolute error" value={fmtMW(h.mae)} note={`${fmtPct(h.wape)} of the wind actually generated`} />
        <Stat label="Bias" value={fmtMW(h.bias, true)} note={`Too high in ${fmtPct(over / total, 0)} of half-hours`} />
        <Stat label="Bad half-hours (P95 error)" value={fmtMW(h.p95_abs)} note={`P90 is ${fmtMW(h.p90_abs)}; the median is ${fmtMW(h.p50_abs)}`} />
        <Stat label="Worst day" value={worst ? fmtDay(worst.delivery_day) : "n/a"} note={worst ? `MAE ${fmtMW(worst.mae)}, largest miss ${fmtMW(worst.max_abs_error)}` : undefined} />
      </dl>

      <Section title="Forecast against actual wind" hint="Drag the handles under the chart, or scroll over it, to zoom into a few days.">
        <Chart option={seriesChart(tokens, a)} height={360} label="Forecast and actual wind generation for January 2026 in megawatts" />
      </Section>

      <Section title="Metrics" hint={a.flagged_periods ? `${a.flagged_periods} flagged periods (late, duplicated or non-positive actuals) are left out of the second column.` : "No periods were flagged, so both columns match. The data quality report lists what was checked."}>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className="num">All periods ({fmtInt(h.n)})</th>
              <th scope="col" className="num">Without flagged ({fmtInt(hx.n)})</th>
            </tr>
          </thead>
          <tbody>
            {hRows.map(([label, v], i) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{v}</td>
                <td className="num">{hxRows[i][1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Percentage error (MAPE) is not shown as a headline. Actual wind can be small, which blows the ratio up. Errors are in MW and are not divided by installed capacity, which is outside the allowed data.</p>
      </Section>

      <div className="two-up">
        <Section title="Spread of errors" hint="Red bars are forecasts above actual (short). Blue bars are forecasts below actual.">
          <Chart option={histogramChart(tokens, a)} height={280} label="Histogram of forecast error in megawatts" />
        </Section>
        <Section title="Error by hour of day" hint="Bars are mean absolute error. The line is bias.">
          <Chart option={hourChart(tokens, a)} height={280} label="Mean absolute error and bias by hour of day" />
        </Section>
      </div>

      <Section title="Error by forecast level" hint={`Forecast level groups are terciles of this month: low below ${fmtMW(a.level_edges_mw[0])}, high above ${fmtMW(a.level_edges_mw[1])}. This is a description of January, not a decision input.`}>
        <MetricsByTable rows={a.by_level} first="Forecast level" />
      </Section>

      <Section title="Error and forecast age" hint="The first chart uses every forecast ever published for each half-hour, to show why the cutoff matters. The table uses the one forecast you would have had.">
        <Chart option={leadChart(tokens, a, leadRange)} height={280} label="Mean absolute error by hours between publication and delivery" />
        <MetricsByTable rows={a.by_horizon} first="Age of the forecast used" />
      </Section>

      <Section title="Worst days">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Delivery day</th>
              <th scope="col" className="num">MAE</th>
              <th scope="col" className="num">Bias</th>
              <th scope="col" className="num">Largest miss</th>
            </tr>
          </thead>
          <tbody>
            {a.worst_days.map((w) => (
              <tr key={w.delivery_day}>
                <th scope="row">{fmtDay(w.delivery_day)}</th>
                <td className="num">{fmtMW(w.mae)}</td>
                <td className="num">{fmtMW(w.bias, true)}</td>
                <td className="num">{fmtMW(w.max_abs_error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <TableView summary="Table view of the hourly chart">
        <MetricsByTable rows={a.by_hour} first="Hour (London)" />
      </TableView>
    </div>
  );
}
