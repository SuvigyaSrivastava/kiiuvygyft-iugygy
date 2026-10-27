import { useDecision } from "../api";
import { Chart } from "../components/Chart";
import { Timeline } from "../components/Timeline";
import { ErrorBlock, Loading, Section, Stat, TableView } from "../components/ui";
import { coverChart, decisionChart } from "../charts";
import type { Controls } from "../controls";
import { fmtDay, fmtGW, fmtGWFromGW, fmtInt, fmtMW, fmtMWh, fmtPct, fmtStamp, fmtTime, previousDay } from "../format";
import type { Tokens } from "../theme";

interface Props {
  c: Controls;
  set: (p: Partial<Controls>) => void;
  tokens: Tokens;
}

export function DecisionView({ c, set, tokens }: Props) {
  const q = useDecision(c);
  if (q.isPending) return <Loading what="the forecast" />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const s = d.summary;
  const hasBand = d.points.some((p) => p.band_low_mw != null);
  const used = d.vintages.map((v) => fmtStamp(v.publish_time)).join(" and ");
  const next = d.timeline.next_vintage_after_decision;
  const leadMode = c.mode === "lead";

  return (
    <div className={q.isFetching ? "view is-stale" : "view"}>
      <header className="lede">
        <h1>Wind to plan around for {fmtDay(d.delivery_day)}</h1>
        <p>
          {leadMode ? (
            <>Each half-hour uses the latest forecast published at least {c.lead} hours before it.</>
          ) : (
            <>
              Latest forecast available at the {fmtTime(d.decision_timestamp)} cutoff on {fmtDay(previousDay(d.delivery_day))}: issued {used}.
              {next ? <> The next one lands at {fmtStamp(next)}, after the cutoff.</> : null}
            </>
          )}
        </p>
      </header>

      <dl className="stats">
        <Stat hero label="Average forecast" value={fmtGWFromGW(s.mean_gw)} note={`${fmtGWFromGW(s.min_gw)} lowest to ${fmtGWFromGW(s.max_gw)} highest over the day`} />
        <Stat
          label="Lowest-wind three hours"
          value={s.low_wind_window ? `${fmtTime(s.low_wind_window.start)} to ${fmtTime(s.low_wind_window.end)}` : "n/a"}
          note={s.low_wind_window ? `Forecast averages ${fmtGW(s.low_wind_window.mean_mw)}` : undefined}
        />
        <Stat
          label={`Extra cover at ${fmtPct(d.target_quantile, 0)}`}
          value={s.total_cover_mwh != null ? fmtMWh(s.total_cover_mwh) : "No band yet"}
          note={
            s.highest_cover_window
              ? `Most needed ${fmtTime(s.highest_cover_window.start)} to ${fmtTime(s.highest_cover_window.end)}, about ${fmtMW(s.highest_cover_window.mean_mw)}`
              : d.band_status
          }
        />
        <div className="stat">
          <dt><label htmlFor="demand">Your flat demand (optional)</label></dt>
          <dd className="stat-value">
            <span className="inline-input">
              <input id="demand" type="number" min={0} step={100} inputMode="numeric" placeholder="e.g. 20000" value={c.demand} onChange={(e) => set({ demand: e.target.value })} />
              <span className="unit">MW</span>
            </span>
          </dd>
          <dd className="stat-note">
            {d.remaining_need_mw != null ? `Remaining thermal need averages ${fmtMW(d.remaining_need_mw)} with cover. Illustrative, from your input.` : "Enter a figure to see what is left for thermal plants. This is your number, not data."}
          </dd>
        </div>
      </dl>

      <Section title="Forecast, range and extra cover" hint={hasBand ? `Range and cover come from forecast errors on ${d.history_days} earlier delivery days, all complete before the cutoff.` : `No range yet: ${d.band_status}. The forecast is shown without a band rather than a guessed one.`}>
        <Chart option={decisionChart(tokens, d.points, { showActual: c.hindsight, showHindsight: c.hindsight })} height={340} label={`Wind forecast for ${fmtDay(d.delivery_day)} in megawatts, half-hourly`} />
        {hasBand && <Chart option={coverChart(tokens, d.points)} height={210} label="Suggested extra cover in megawatts, half-hourly" />}
        {c.hindsight && d.day_metrics && (
          <p className="callout">
            Hindsight, not available on the day: this forecast missed actual wind by {fmtMW(d.day_metrics.mae)} on average and was {fmtMW(d.day_metrics.bias, true)} on bias (positive means too high).
          </p>
        )}
        <TableView summary="Table view of this chart">
          <table className="data">
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
          </table>
        </TableView>
      </Section>

      <Section title="How the cover is set" id="cover-how">
        <p className="prose">
          You said a shortfall costs {c.ratio} times a surplus, so the cover is sized to be enough in {fmtPct(d.target_quantile, 0)} of half-hours. For each half-hour it is the {fmtPct(d.target_quantile, 0)} point of how far past forecasts ran above actual wind, in the same forecast level, never below zero. Forecast too high means you are short, so that is the side that sets the cover.
        </p>
      </Section>

      {!leadMode && (
        <Section title="Where this forecast sits in time">
          <Timeline tl={d.timeline} tokens={tokens} />
        </Section>
      )}
    </div>
  );
}
