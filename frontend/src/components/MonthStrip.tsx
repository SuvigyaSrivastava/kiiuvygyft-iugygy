import { useMemo } from "react";
import type { Month } from "../types";
import { fmtDay, fmtDayShort, fmtGWFromGW } from "../format";

interface Props {
  month: Month | undefined;
  selected: string;
  onPick: (day: string) => void;
}

/** One bar per delivery day: the average forecast at the chosen cutoff. Forecast only, so nothing here is hindsight. */
export function MonthStrip({ month, selected, onPick }: Props) {
  const days = month?.days ?? [];
  const top = useMemo(() => Math.max(1, ...days.map((d) => d.mean_gw ?? 0)), [days]);
  if (days.length === 0) return <div className="strip strip-empty" aria-hidden="true" />;
  return (
    <div className="strip-wrap">
      <div className="strip" role="group" aria-label="Average forecast for each delivery day. Choose a day.">
        {days.map((d) => {
          const on = d.delivery_day === selected;
          const h = d.mean_gw == null ? 0 : Math.max(6, Math.round((d.mean_gw / top) * 100));
          return (
            <button
              key={d.delivery_day}
              type="button"
              className={on ? "bar on" : "bar"}
              aria-pressed={on}
              aria-label={`${fmtDay(d.delivery_day)}, average forecast ${d.mean_gw == null ? "not available" : fmtGWFromGW(d.mean_gw)}`}
              title={`${fmtDay(d.delivery_day)}: ${d.mean_gw == null ? "no forecast" : `${fmtGWFromGW(d.mean_gw)} average`}`}
              onClick={() => onPick(d.delivery_day)}
            >
              <span style={{ height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="strip-axis" aria-hidden="true">
        <span>{fmtDayShort(days[0].delivery_day)}</span>
        <span>Average forecast each day</span>
        <span>{fmtDayShort(days[days.length - 1].delivery_day)}</span>
      </div>
    </div>
  );
}
