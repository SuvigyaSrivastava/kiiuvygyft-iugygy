import { type Controls, isCutoff, targetQuantile } from "../controls";
import { fmtDay, fmtPct } from "../format";
import type { Meta } from "../types";

interface Props {
  c: Controls;
  set: (patch: Partial<Controls>) => void;
  meta: Meta | undefined;
}

const PRESETS = ["09:00", "09:20", "09:50", "11:00"];

/** Day stepper. Only the Decision view needs it. */
export function DayPicker({ c, set, meta }: Props) {
  const days = meta ? meta.delivery_days[c.scope] : [];
  const idx = days.indexOf(c.day);
  return (
    <div className="daypicker" role="group" aria-label="Delivery day">
      <button type="button" className="step" aria-label="Previous day" disabled={idx <= 0} onClick={() => set({ day: days[idx - 1] })}>
        &lsaquo;
      </button>
      <label className="day-select">
        <span className="sr-only">Delivery day</span>
        <select value={c.day} onChange={(e) => set({ day: e.target.value })}>
          {days.length === 0 && <option value={c.day}>{fmtDay(c.day)}</option>}
          {days.map((d) => (
            <option key={d} value={d}>{fmtDay(d)}</option>
          ))}
        </select>
      </label>
      <button type="button" className="step" aria-label="Next day" disabled={idx < 0 || idx >= days.length - 1} onClick={() => set({ day: days[idx + 1] })}>
        &rsaquo;
      </button>
    </div>
  );
}

/** Every other assumption, folded away until someone wants to change it. */
export function SettingsPanel({ c, set, meta }: Props) {
  const custom = !PRESETS.includes(c.cutoff);
  const q = targetQuantile(c.ratio);
  const summary = `${c.mode === "cutoff" ? `Cutoff ${c.cutoff}` : `${c.lead} h lead`}, cover for ${fmtPct(q, 0)}`;

  return (
    <details className="settings">
      <summary>
        <span>Settings</span>
        <span className="sum">{summary}</span>
      </summary>
      <form className="settings-body" aria-label="Decision settings" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="group">
          <legend>Which forecast to use</legend>
          <div className="seg" role="radiogroup" aria-label="Selection mode">
            <label className={c.mode === "cutoff" ? "on" : ""}>
              <input type="radio" name="mode" checked={c.mode === "cutoff"} onChange={() => set({ mode: "cutoff" })} />
              Latest before cutoff
            </label>
            <label className={c.mode === "lead" ? "on" : ""}>
              <input type="radio" name="mode" checked={c.mode === "lead"} onChange={() => set({ mode: "lead" })} />
              Fixed lead time
            </label>
          </div>
          {c.mode === "cutoff" ? (
            <div className="row">
              <select aria-label="Cutoff, London time" value={custom ? "custom" : c.cutoff} onChange={(e) => e.target.value !== "custom" && set({ cutoff: e.target.value })}>
                {PRESETS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value="custom">Other time</option>
              </select>
              {custom && (
                <input type="time" aria-label="Custom cutoff, London time" value={c.cutoff} onChange={(e) => isCutoff(e.target.value) && set({ cutoff: e.target.value })} />
              )}
              <span className="unit">London time, the day before</span>
            </div>
          ) : (
            <div className="row">
              <input type="number" aria-label="Minimum lead time in hours" min={0} max={48} step={1} value={c.lead} onChange={(e) => set({ lead: Math.min(48, Math.max(0, Number(e.target.value) || 0)) })} className="narrow" />
              <span className="unit">hours before each half-hour</span>
            </div>
          )}
        </fieldset>

        <div className="group">
          <label htmlFor="c-ratio" className="legend">Cost of being short, against a surplus</label>
          <div className="row">
            <input id="c-ratio" type="number" min={0.1} max={100} step={0.5} value={c.ratio} onChange={(e) => Number(e.target.value) > 0 && set({ ratio: Number(e.target.value) })} className="narrow" />
            <span className="unit">times. Cover is sized for {fmtPct(q, 0)} of shortfalls.</span>
          </div>
        </div>

        <div className="group">
          <label htmlFor="c-scope" className="legend">Days</label>
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
          <span className="unit">{c.scope === "decision_in_january" ? "Decisions 1 to 31 Jan, delivery 2 Jan to 1 Feb" : "Delivery 1 to 31 Jan"}</span>
        </div>

        <div className="group">
          <label htmlFor="c-interp" className="legend">Hourly forecast to half-hours</label>
          <select id="c-interp" value={c.interp} onChange={(e) => set({ interp: e.target.value as Controls["interp"] })}>
            <option value="hold">Hold the hourly value</option>
            <option value="linear">Interpolate linearly</option>
          </select>
        </div>

        <div className="group">
          <label className="check">
            <input type="checkbox" checked={c.hindsight} onChange={(e) => set({ hindsight: e.target.checked })} />
            Show actual wind (hindsight)
          </label>
          <span className="unit">Not available on the day. Shows what really happened and the latest forecast ever issued.</span>
        </div>
      </form>
    </details>
  );
}
