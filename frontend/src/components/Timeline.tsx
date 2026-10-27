import { fmtDayShort, fmtStamp, fmtTime } from "../format";
import type { Tokens } from "../theme";
import type { Decision } from "../types";

/** Publish times, the decision timestamp and the delivery day on one axis. Plain SVG. */
export function Timeline({ tl, tokens }: { tl: Decision["timeline"]; tokens: Tokens }) {
  const vint = tl.vintages.map((v) => Date.parse(v));
  const cutoff = Date.parse(tl.decision_timestamp);
  const dStart = Date.parse(tl.delivery_start);
  const dEnd = Date.parse(tl.delivery_end);
  const lo = Math.min(...vint, cutoff, dStart) - 30 * 60_000;
  const hi = dEnd + 30 * 60_000;
  const W = 900;
  const H = 160;
  const pad = 28;
  const x = (t: number) => pad + ((t - lo) / (hi - lo)) * (W - pad * 2);
  const axisY = 84;
  const after = tl.next_vintage_after_decision ? Date.parse(tl.next_vintage_after_decision) : null;
  const ticks: number[] = [];
  const first = new Date(lo);
  first.setUTCMinutes(0, 0, 0);
  for (let t = first.getTime(); t < hi; t += 3_600_000) if (new Date(t).getUTCHours() % 6 === 0 && t > lo) ticks.push(t);
  const used = tl.vintages.filter((v) => Date.parse(v) <= cutoff);
  const chosen = used.length ? Date.parse(used[used.length - 1]) : null;

  return (
    <figure className="timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Forecasts published before the ${fmtTime(tl.decision_timestamp)} cutoff, and the delivery day that follows`}>
        <rect x={x(dStart)} y={axisY - 22} width={x(dEnd) - x(dStart)} height={44} fill={tokens.forecast} opacity={0.1} />
        <text x={x(dStart) + 8} y={axisY - 28} fill={tokens.ink2} fontSize={12}>Delivery day</text>
        <line x1={pad} x2={W - pad} y1={axisY} y2={axisY} stroke={tokens.axis} strokeWidth={1} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 5} stroke={tokens.axis} />
            <text x={x(t)} y={axisY + 20} textAnchor="middle" fill={tokens.muted} fontSize={12}>{new Date(t).getUTCHours() === 0 ? fmtDayShort(new Date(t).toISOString().slice(0, 10)) : `${String(new Date(t).getUTCHours()).padStart(2, "0")}:00`}</text>
          </g>
        ))}
        {tl.vintages.map((v) => {
          const t = Date.parse(v);
          const isChosen = t === chosen;
          const late = t > cutoff;
          return (
            <g key={v}>
              <circle cx={x(t)} cy={axisY} r={isChosen ? 6 : 4} fill={late ? tokens.surface : tokens.forecast} stroke={isChosen ? tokens.surface : tokens.forecast} strokeWidth={2} />
              <title>{`Published ${fmtStamp(v)}`}</title>
            </g>
          );
        })}
        {chosen != null && (
          <text x={x(chosen)} y={axisY - 14} textAnchor="end" fill={tokens.ink} fontSize={12}>{`Used: ${fmtTime(new Date(chosen).toISOString())}`}</text>
        )}
        <line x1={x(cutoff)} x2={x(cutoff)} y1={14} y2={axisY + 30} stroke={tokens.ink} strokeWidth={2} />
        <text x={x(cutoff) + 6} y={26} fill={tokens.ink} fontSize={12}>{`Cutoff ${fmtTime(tl.decision_timestamp)}`}</text>
        {after != null && after < hi && (
          <text x={x(after)} y={axisY + 44} textAnchor="middle" fill={tokens.ink2} fontSize={12}>{`Next: ${fmtTime(tl.next_vintage_after_decision as string)} (too late)`}</text>
        )}
      </svg>
      <figcaption>Filled dots were published before the cutoff. Open dots came later and cannot be used for this decision.</figcaption>
    </figure>
  );
}
