import { fmtGW, fmtInt, fmtMW, fmtPct, fmtTime, fmtDayShort } from "./format";
import type { ChartOption } from "./components/Chart";
import type { Tokens } from "./theme";
import type { Accuracy, CalibrationResp, DecisionPoint, Sensitivity } from "./types";

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function base(t: Tokens) {
  return {
    animation: false,
    useUTC: true,
    textStyle: { fontFamily: FONT, color: t.ink2 },
    grid: { left: 64, right: 24, top: 58, bottom: 44 },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 12 }, selectedMode: false },
    tooltip: { trigger: "axis", backgroundColor: t.surface, borderColor: t.axis, borderWidth: 1, textStyle: { color: t.ink, fontSize: 12 }, axisPointer: { lineStyle: { color: t.axis } } },
  };
}

function axisLine(t: Tokens) {
  return { axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 12 } };
}

function yValue(t: Tokens, name: string, extra: Record<string, unknown> = {}) {
  return {
    type: "value",
    name,
    nameTextStyle: { color: t.muted, fontSize: 12, align: "left" },
    nameGap: 14,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => fmtInt(v) },
    splitLine: { lineStyle: { color: t.grid } },
    ...extra,
  };
}

/** Time axes use UTC. That equals London time in January, which is all this snapshot covers. */
function timeAxis(t: Tokens, extra: Record<string, unknown> = {}) {
  return { type: "time", ...axisLine(t), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 12 }, ...extra };
}

const ms = (iso: string) => Date.parse(iso);

export function decisionChart(t: Tokens, pts: DecisionPoint[], opts: { showActual: boolean; showHindsight: boolean; lowWindow?: { start: string; end: string } | null }): ChartOption {
  const hasBand = pts.some((p) => p.band_low_mw != null);
  const series: Record<string, unknown>[] = [];
  if (hasBand) {
    series.push(
      { name: "band base", type: "line", stack: "band", symbol: "none", lineStyle: { opacity: 0 }, data: pts.map((p) => [ms(p.t), p.band_low_mw]), silent: true, tooltip: { show: false } },
      { name: "P10 to P90 range", type: "line", stack: "band", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: t.forecast, opacity: 0.2 }, data: pts.map((p) => [ms(p.t), (p.band_high_mw ?? 0) - (p.band_low_mw ?? 0)]), silent: true },
    );
  }
  const low = opts.lowWindow
    ? { silent: true, itemStyle: { color: t.forecast, opacity: 0.07 }, label: { show: true, position: "insideTop", color: t.muted, fontSize: 12, formatter: "Lowest three hours" }, data: [[{ xAxis: ms(opts.lowWindow.start) }, { xAxis: ms(opts.lowWindow.end) }]] }
    : undefined;
  series.push({ name: "Forecast at cutoff", type: "line", symbol: "none", step: "start", lineStyle: { color: t.forecast, width: 2 }, itemStyle: { color: t.forecast }, markArea: low, data: pts.map((p) => [ms(p.t), p.forecast_mw]) });
  if (opts.showHindsight) {
    series.push({ name: "Latest forecast ever published (hindsight)", type: "line", symbol: "none", step: "start", lineStyle: { color: t.actual, width: 2, type: "dashed" }, itemStyle: { color: t.actual }, data: pts.map((p) => [ms(p.t), p.hindsight_forecast_mw]) });
  }
  if (opts.showActual) {
    series.push({ name: "Actual wind (hindsight)", type: "line", symbol: "none", lineStyle: { color: t.actual, width: 2 }, itemStyle: { color: t.actual }, data: pts.map((p) => [ms(p.t), p.actual_mw]) });
  }
  const b = base(t);
  const calm = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    ...b,
    animation: !calm,
    animationDuration: 700,
    animationEasing: "cubicOut",
    legend: { ...b.legend, data: ["Forecast at cutoff", ...(hasBand ? [{ name: "P10 to P90 range", icon: "rect", itemStyle: { color: t.forecast, opacity: 0.45 } }] : []), ...(opts.showHindsight ? ["Latest forecast ever published (hindsight)"] : []), ...(opts.showActual ? ["Actual wind (hindsight)"] : [])] },
    tooltip: {
      ...b.tooltip,
      formatter: (params: { dataIndex: number }[]) => {
        const i = params[0]?.dataIndex ?? 0;
        const p = pts[i];
        if (!p) return "";
        const lines = [`<b>${fmtTime(p.t)}</b>`, `Forecast ${fmtMW(p.forecast_mw)}`];
        if (p.band_low_mw != null && p.band_high_mw != null) lines.push(`P10 to P90 ${fmtMW(p.band_low_mw)} to ${fmtMW(p.band_high_mw)}`);
        if (p.cover_mw != null) lines.push(`Suggested extra cover ${fmtMW(p.cover_mw)}`);
        if (p.hindsight_forecast_mw != null && opts.showHindsight) lines.push(`Latest ever ${fmtMW(p.hindsight_forecast_mw)}`);
        if (p.actual_mw != null && opts.showActual) lines.push(`Actual ${fmtMW(p.actual_mw)}`);
        return lines.join("<br/>");
      },
    },
    xAxis: timeAxis(t, { axisLabel: { color: t.muted, fontSize: 12, formatter: "{HH}:{mm}" }}),
    yAxis: yValue(t, "MW", { min: 0 }),
    series,
  };
}

export function coverChart(t: Tokens, pts: DecisionPoint[]): ChartOption {
  const b = base(t);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 52, bottom: 36 },
    legend: { ...b.legend, data: ["Suggested extra cover"] },
    tooltip: { ...b.tooltip, formatter: (params: { dataIndex: number }[]) => { const p = pts[params[0]?.dataIndex ?? 0]; return p ? `<b>${fmtTime(p.t)}</b><br/>Extra cover ${fmtMW(p.cover_mw)}` : ""; } },
    xAxis: timeAxis(t, { axisLabel: { color: t.muted, fontSize: 12, formatter: "{HH}:{mm}" }}),
    yAxis: yValue(t, "MW", { min: 0, splitNumber: 3 }),
    series: [{ name: "Suggested extra cover", type: "bar", barMaxWidth: 10, itemStyle: { color: t.forecast, borderRadius: [3, 3, 0, 0] }, data: pts.map((p) => [ms(p.t), p.cover_mw ?? 0]) }],
  };
}

export function seriesChart(t: Tokens, a: Accuracy): ChartOption {
  const b = base(t);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 58, bottom: 76 },
    legend: { ...b.legend, data: ["Forecast at cutoff", "Actual wind"] },
    tooltip: { ...b.tooltip, formatter: (params: { dataIndex: number }[]) => { const p = a.series[params[0]?.dataIndex ?? 0]; return p ? `<b>${fmtDayShort(p.t.slice(0, 10))} ${fmtTime(p.t)}</b><br/>Forecast ${fmtMW(p.forecast_mw)}<br/>Actual ${fmtMW(p.actual_mw)}<br/>Error ${fmtMW(p.forecast_mw - p.actual_mw, true)}` : ""; } },
    xAxis: timeAxis(t),
    yAxis: yValue(t, "MW", { min: 0 }),
    dataZoom: [
      { type: "inside", filterMode: "none" },
      { type: "slider", height: 22, bottom: 8, borderColor: t.axis, fillerColor: "rgba(42,120,214,0.15)", textStyle: { color: t.muted }, handleStyle: { color: t.forecast }, filterMode: "none" },
    ],
    series: [
      { name: "Actual wind", type: "line", symbol: "none", sampling: "lttb", lineStyle: { color: t.actual, width: 1.5 }, itemStyle: { color: t.actual }, data: a.series.map((p) => [ms(p.t), p.actual_mw]) },
      { name: "Forecast at cutoff", type: "line", symbol: "none", sampling: "lttb", lineStyle: { color: t.forecast, width: 1.5 }, itemStyle: { color: t.forecast }, data: a.series.map((p) => [ms(p.t), p.forecast_mw]) },
    ],
  };
}

export function histogramChart(t: Tokens, a: Accuracy): ChartOption {
  const b = base(t);
  const mid = (h: { from_mw: number; to_mw: number }) => (h.from_mw + h.to_mw) / 2;
  const total = a.histogram.reduce((s, h) => s + h.count, 0);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 36, bottom: 48 },
    legend: { show: false },
    tooltip: { ...b.tooltip, trigger: "item", formatter: (p: { dataIndex: number }) => { const h = a.histogram[p.dataIndex]; return h ? `${fmtMW(h.from_mw, true)} to ${fmtMW(h.to_mw, true)}<br/>${fmtInt(h.count)} half-hours (${fmtPct(h.count / total)})` : ""; } },
    xAxis: { type: "category", data: a.histogram.map((h) => fmtInt(mid(h))), name: "Error, forecast minus actual (MW)", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: t.muted, fontSize: 12 }, ...axisLine(t), axisLabel: { color: t.muted, fontSize: 12, interval: 3 } },
    yAxis: yValue(t, "Half-hours"),
    series: [{ type: "bar", barCategoryGap: "12%", data: a.histogram.map((h) => ({ value: h.count, itemStyle: { color: mid(h) > 0 ? t.over : t.under, borderRadius: [3, 3, 0, 0] } })) }],
  };
}

export function hourChart(t: Tokens, a: Accuracy): ChartOption {
  const b = base(t);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 58, bottom: 44 },
    legend: { ...b.legend, data: ["Mean absolute error", "Bias"] },
    tooltip: { ...b.tooltip, formatter: (params: { dataIndex: number }[]) => { const r = a.by_hour[params[0]?.dataIndex ?? 0]; return r ? `<b>${r.label} London</b><br/>MAE ${fmtMW(r.mae)}<br/>Bias ${fmtMW(r.bias, true)}<br/>${fmtInt(r.n)} half-hours` : ""; } },
    xAxis: { type: "category", data: a.by_hour.map((r) => r.label.slice(0, 2)), name: "Hour of day (London)", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: t.muted, fontSize: 12 }, ...axisLine(t) },
    yAxis: yValue(t, "MW"),
    series: [
      { name: "Mean absolute error", type: "bar", barMaxWidth: 16, itemStyle: { color: t.forecast, borderRadius: [3, 3, 0, 0] }, data: a.by_hour.map((r) => r.mae) },
      { name: "Bias", type: "line", symbol: "circle", symbolSize: 8, lineStyle: { color: t.over, width: 2 }, itemStyle: { color: t.over, borderColor: t.surface, borderWidth: 2 }, data: a.by_hour.map((r) => r.bias) },
    ],
  };
}

export function leadChart(t: Tokens, a: Accuracy, marks: { from: number; to: number } | null): ChartOption {
  const b = base(t);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 58, bottom: 44 },
    legend: { ...b.legend, data: ["Mean absolute error", "Bias"] },
    tooltip: { ...b.tooltip, formatter: (params: { dataIndex: number }[]) => { const r = a.error_vs_lead[params[0]?.dataIndex ?? 0]; return r ? `<b>Published ${r.from_h} to ${r.to_h} h before</b><br/>MAE ${fmtMW(r.mae)}<br/>Bias ${fmtMW(r.bias, true)}<br/>${fmtInt(r.n)} forecast rows` : ""; } },
    xAxis: { type: "category", data: a.error_vs_lead.map((r) => `${r.from_h}`), name: "Hours between publication and the half-hour (all vintages)", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: t.muted, fontSize: 12 }, ...axisLine(t) },
    yAxis: yValue(t, "MW"),
    series: [
      {
        name: "Mean absolute error", type: "line", symbol: "circle", symbolSize: 8, lineStyle: { color: t.forecast, width: 2 }, itemStyle: { color: t.forecast, borderColor: t.surface, borderWidth: 2 },
        data: a.error_vs_lead.map((r) => r.mae),
        markArea: marks ? { silent: true, itemStyle: { color: t.forecast, opacity: 0.08 }, label: { color: t.ink2, fontSize: 12, position: "insideTop" }, data: [[{ name: "Range at your cutoff", xAxis: `${Math.floor(marks.from / 3) * 3}` }, { xAxis: `${Math.floor(marks.to / 3) * 3}` }]] } : undefined,
      },
      { name: "Bias", type: "line", symbol: "circle", symbolSize: 8, lineStyle: { color: t.over, width: 2 }, itemStyle: { color: t.over, borderColor: t.surface, borderWidth: 2 }, data: a.error_vs_lead.map((r) => r.bias) },
    ],
  };
}

export function leadCurveChart(t: Tokens, s: Sensitivity): ChartOption {
  const b = base(t);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 36, bottom: 48 },
    legend: { show: false },
    tooltip: { ...b.tooltip, formatter: (params: { dataIndex: number }[]) => { const r = s.lead_curve[params[0]?.dataIndex ?? 0]; return r ? `<b>At least ${r.lead_hours} h ahead</b><br/>MAE ${fmtMW(r.metrics.mae)}<br/>Bias ${fmtMW(r.metrics.bias, true)}` : ""; } },
    xAxis: { type: "category", data: s.lead_curve.map((r) => `${r.lead_hours}`), name: "Minimum lead time (hours before the half-hour)", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: t.muted, fontSize: 12 }, ...axisLine(t) },
    yAxis: yValue(t, "MAE (MW)", { min: (v: { min: number }) => Math.floor(v.min / 100) * 100 }),
    series: [{ type: "line", symbol: "circle", symbolSize: 8, lineStyle: { color: t.forecast, width: 2 }, itemStyle: { color: t.forecast, borderColor: t.surface, borderWidth: 2 }, data: s.lead_curve.map((r) => r.metrics.mae) }],
  };
}

export function calibrationChart(t: Tokens, c: CalibrationResp): ChartOption {
  const b = base(t);
  const days = c.calibration.per_day.filter((d) => d.coverage != null);
  return {
    ...b,
    grid: { left: 64, right: 24, top: 36, bottom: 56 },
    legend: { show: false },
    tooltip: { ...b.tooltip, formatter: (params: { dataIndex: number }[]) => { const d = days[params[0]?.dataIndex ?? 0]; return d ? `<b>${fmtDayShort(d.delivery_day)}</b><br/>Inside band ${fmtPct(d.coverage)}<br/>Below band ${fmtPct(d.below)}<br/>Above band ${fmtPct(d.above)}` : ""; } },
    xAxis: { type: "category", data: days.map((d) => d.delivery_day.slice(8)), name: "Delivery day of month, January 2026", nameLocation: "middle", nameGap: 32, nameTextStyle: { color: t.muted, fontSize: 12 }, ...axisLine(t) },
    yAxis: yValue(t, "Share inside band", { min: 0, max: 1, axisLabel: { color: t.muted, fontSize: 12, formatter: (v: number) => `${Math.round(v * 100)}%` } }),
    series: [{
      type: "bar", barMaxWidth: 18, data: days.map((d) => d.coverage), itemStyle: { color: t.forecast, borderRadius: [3, 3, 0, 0] },
      markLine: { silent: true, symbol: "none", lineStyle: { color: t.ink2, width: 1, type: "solid" }, label: { color: t.ink2, formatter: "Nominal 80%", position: "insideStartTop", fontSize: 12 }, data: [{ yAxis: 0.8 }] },
    }],
  };
}

export { fmtGW };
