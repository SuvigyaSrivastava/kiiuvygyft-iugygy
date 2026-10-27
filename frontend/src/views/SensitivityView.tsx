import { useState } from "react";
import { useSensitivity } from "../api";
import { Chart } from "../components/Chart";
import { ErrorBlock, Loading, Section, Stat } from "../components/ui";
import { leadCurveChart } from "../charts";
import { type Controls, isCutoff } from "../controls";
import { fmtInt, fmtMW, fmtPct } from "../format";
import type { Tokens } from "../theme";

const BASE = ["09:00", "09:20", "09:50", "11:00"];

export function SensitivityView({ c, tokens }: { c: Controls; tokens: Tokens }) {
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const cutoffs = [...new Set([...BASE, ...extra])].sort();
  const q = useSensitivity(c, cutoffs);

  const add = () => {
    if (isCutoff(draft) && cutoffs.length < 8) setExtra((x) => [...x, draft]);
    setDraft("");
  };

  if (q.isPending) return <Loading what="cutoff results" />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const hs = s.hindsight;
  const pair = (a: string, b: string) => (a === b ? 0 : (s.pairwise.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))?.share_differs ?? 0));
  const vintages = [...new Set(s.cutoffs.flatMap((r) => Object.keys(r.vintage_share)))].sort();

  return (
    <div className={q.isFetching ? "view is-stale" : "view"}>
      <header className="lede">
        <h1>Does the cutoff time change the answer?</h1>
        <p>{s.finding}</p>
      </header>

      <Section title="Add a cutoff to test" hint="Gate closure for the GB day-ahead auction is a morning time, not 11:00. Published sources give 09:20 UK time (EPEX) and 09:50 (Nord Pool N2EX), so the default set straddles both.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <label htmlFor="extra-cutoff" className="sr-only">Cutoff to add, London time</label>
          <input id="extra-cutoff" type="time" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="btn" disabled={!isCutoff(draft) || cutoffs.length >= 8}>Add cutoff</button>
          {extra.length > 0 && <button type="button" className="btn" onClick={() => setExtra([])}>Reset</button>}
        </form>
      </Section>

      <Section title="Accuracy by cutoff">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Cutoff (London)</th>
                <th scope="col">Forecast issued at</th>
                <th scope="col" className="num">MAE</th>
                <th scope="col" className="num">RMSE</th>
                <th scope="col" className="num">Bias</th>
                <th scope="col" className="num">P90 abs error</th>
                <th scope="col" className="num">Half-hours without forecast</th>
              </tr>
            </thead>
            <tbody>
              {s.cutoffs.map((r) => (
                <tr key={r.cutoff}>
                  <th scope="row">{r.cutoff}</th>
                  <td>{Object.entries(r.vintage_share).map(([k, v]) => `${k} (${fmtPct(v, 0)})`).join(", ")}</td>
                  <td className="num">{fmtMW(r.metrics.mae)}</td>
                  <td className="num">{fmtMW(r.metrics.rmse)}</td>
                  <td className="num">{fmtMW(r.metrics.bias, true)}</td>
                  <td className="num">{fmtMW(r.metrics.p90_abs)}</td>
                  <td className="num">{fmtInt(r.targets_without_forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">The cutoffs above choose between the {vintages.join(" and ")} London-time forecast issues. A cutoff only changes the answer if it moves across an issue time.</p>
      </Section>

      <Section title="Share of half-hours where the chosen forecast differs" hint="Read across a row: how many half-hours would use a different forecast issue if you moved from the cutoff on the left to the one on the top.">
        <div className="table-scroll">
          <table className="data matrix">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">From cutoff</span></th>
                {s.cutoffs.map((r) => (
                  <th scope="col" key={r.cutoff} className="num">{r.cutoff}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.cutoffs.map((a) => (
                <tr key={a.cutoff}>
                  <th scope="row">{a.cutoff}</th>
                  {s.cutoffs.map((b) => {
                    const v = pair(a.cutoff, b.cutoff);
                    return <td key={b.cutoff} className={v > 0 ? "num diff" : "num"}>{fmtPct(v, 0)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Forecast age instead of a clock time" hint="Accuracy if each half-hour used the latest forecast published at least this many hours earlier. Longer lead means an older, less accurate forecast.">
        <Chart option={leadCurveChart(tokens, s)} height={260} label="Mean absolute error by minimum lead time" />
      </Section>

      <Section title="What hindsight does to accuracy" hint={`Compared at the ${hs.cutoff} cutoff. The hindsight series takes the latest forecast ever published for each half-hour, including ones issued after that half-hour had started.`}>
        <dl className="stats">
          <Stat label={`Forecast available at ${hs.cutoff}`} value={fmtMW(hs.decision_time.mae)} note="Mean absolute error" />
          <Stat label="Latest ever published" value={fmtMW(hs.latest_ever.mae)} note="Mean absolute error" />
          <Stat label="Looks better by" value={fmtMW(hs.mae_gap_mw)} note="That gap is hindsight, not skill" />
          <Stat label="Hindsight forecasts issued after the half-hour began" value={fmtPct(hs.share_after_delivery_start, 0)} note="Impossible to use when buying" />
        </dl>
      </Section>
    </div>
  );
}
