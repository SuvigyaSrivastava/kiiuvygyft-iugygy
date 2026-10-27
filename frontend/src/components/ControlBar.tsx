import { type Controls, isCutoff, targetQuantile } from "../controls";
import { fmtDay, fmtPct } from "../format";
import type { Meta } from "../types";

interface Props {
  c: Controls;
  set: (patch: Partial<Controls>) => void;
  meta: Meta | undefined;
}

const PRESETS = ["09:00", "09:20", "09:50", "11:00"];

export function ControlBar({ c, set, meta }: Props) {
  const days = meta ? meta.delivery_days[c.scope] : [];
  const custom = !PRESETS.includes(c.cutoff);
  const idx = days.indexOf(c.day);
  const q = targetQuantile(c.ratio);

  return (
    <form className="controls" aria-label="Decision settings" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor="c-scope">Which days</label>
        <select
          id="c-scope"
          value={c.scope}
          onChange={(e) => {
            const scope = e.target.value as Controls["scope"];
            const list = meta?.delivery_days[scope] ?? [];
            set({ scope, day: list.includes(c.day) ? c.day : (list[list.length > 14 ? 14 : 0] ?? c.day) });
          }}
        >
          <option value="decision_in_january">Decided in January</option>
          <option value="delivery_in_january">Delivered in January</option>
        </select>
        <span className="unit">{c.scope === "decision_in_january" ? "Decision day 1 to 31 Jan, delivery 2 Jan to 1 Feb" : "Delivery day 1 to 31 Jan"}</span>
      </div>

      <div className="field">
        <label htmlFor="c-day">Delivery day</label>
        <div className="row">
          <button type="button" className="btn btn-icon" aria-label="Previous day" disabled={idx <= 0} onClick={() => set({ day: days[idx - 1] })}>
            &lsaquo;
          </button>
          <select id="c-day" value={c.day} onChange={(e) => set({ day: e.target.value })}>
            {days.length === 0 && <option value={c.day}>{fmtDay(c.day)}</option>}
            {days.map((d) => (
              <option key={d} value={d}>{fmtDay(d)}</option>
            ))}
          </select>
          <button type="button" className="btn btn-icon" aria-label="Next day" disabled={idx < 0 || idx >= days.length - 1} onClick={() => set({ day: days[idx + 1] })}>
            &rsaquo;
          </button>
        </div>
      </div>

      <fieldset className="field">
        <legend>Forecast available</legend>
        <div className="row">
          <div className="seg" role="radiogroup" aria-label="Selection mode">
            <label className={c.mode === "cutoff" ? "on" : ""}>
              <input type="radio" name="mode" checked={c.mode === "cutoff"} onChange={() => set({ mode: "cutoff" })} />
              At cutoff
            </label>
            <label className={c.mode === "lead" ? "on" : ""}>
              <input type="radio" name="mode" checked={c.mode === "lead"} onChange={() => set({ mode: "lead" })} />
              Min lead time
            </label>
          </div>
          {c.mode === "cutoff" ? (
            <>
              <select aria-label="Cutoff, London time" value={custom ? "custom" : c.cutoff} onChange={(e) => e.target.value !== "custom" && set({ cutoff: e.target.value })}>
                {PRESETS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value="custom">Other time</option>
              </select>
              {custom && (
                <input
                  type="time"
                  aria-label="Custom cutoff, London time"
                  value={c.cutoff}
                  onChange={(e) => isCutoff(e.target.value) && set({ cutoff: e.target.value })}
                />
              )}
              <span className="unit">London time, day before</span>
            </>
          ) : (
            <>
              <input type="number" aria-label="Minimum lead time in hours" min={0} max={48} step={1} value={c.lead} onChange={(e) => set({ lead: Math.min(48, Math.max(0, Number(e.target.value) || 0)) })} className="narrow" />
              <span className="unit">hours before each half-hour</span>
            </>
          )}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="c-ratio">Cost of short / cost of surplus</label>
        <div className="row">
          <input id="c-ratio" type="number" min={0.1} max={100} step={0.5} value={c.ratio} onChange={(e) => Number(e.target.value) > 0 && set({ ratio: Number(e.target.value) })} className="narrow" />
          <span className="unit">cover for {fmtPct(q, 0)} of shortfalls</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="c-interp">Hourly forecast to half-hours</label>
        <select id="c-interp" value={c.interp} onChange={(e) => set({ interp: e.target.value as Controls["interp"] })}>
          <option value="hold">Hold the hourly value</option>
          <option value="linear">Interpolate linearly</option>
        </select>
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" checked={c.hindsight} onChange={(e) => set({ hindsight: e.target.checked })} />
          Hindsight view
        </label>
        <span className="unit">Shows actual wind and the latest forecast ever published. Not available on the day.</span>
      </div>
    </form>
  );
}
