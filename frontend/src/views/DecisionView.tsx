import { useDecision } from "../api";
import { Chart } from "../components/Chart";
import { Timeline } from "../components/Timeline";
import { Disclosure, ErrorBlock, Loading, Stat } from "../components/ui";
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
        <Chart option={decisionChart(tokens, d.points, { showActual: c.hindsight, showHindsight: c.hindsight })} height={340} label={`Wind forecast for ${fmtDay(d.delivery_day)} in megawatts, half-hourly`} />
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
            <Chart option={coverChart(tokens, d.points)} height={210} label="Suggested extra cover in megawatts, half-hourly" />
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
