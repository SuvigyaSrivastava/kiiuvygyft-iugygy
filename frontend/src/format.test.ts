import { describe, expect, it } from "vitest";
import { fmtDay, fmtGW, fmtMW, fmtMWh, fmtPct, fmtRatio, fmtStamp, fmtTime, previousDay, summaryText } from "./format";

describe("format", () => {
  it("formats megawatts with separators and explicit sign when asked", () => {
    expect(fmtMW(11609.6)).toBe("11,610 MW");
    expect(fmtMW(1747.9, true)).toBe("+1,748 MW");
    expect(fmtMW(-312, true)).toBe("-312 MW");
    expect(fmtMW(0.2, true)).toBe("0 MW");
  });
  it("shows n/a rather than NaN or null", () => {
    expect(fmtMW(null)).toBe("n/a");
    expect(fmtGW(Number.NaN)).toBe("n/a");
    expect(fmtPct(undefined)).toBe("n/a");
  });
  it("formats gigawatts with one decimal", () => {
    expect(fmtGW(11609)).toBe("11.6 GW");
    expect(fmtGW(-1500, true)).toBe("-1.5 GW");
    expect(fmtGW(20, true)).toBe("0.0 GW");
  });
  it("formats energy and percentages", () => {
    expect(fmtMWh(41118)).toBe("41,118 MWh");
    expect(fmtPct(0.7977)).toBe("79.8%");
    expect(fmtPct(0.75, 0)).toBe("75%");
    expect(fmtRatio(3)).toBe("3");
    expect(fmtRatio(2.5)).toBe("2.50");
  });
  it("writes dates with the weekday, in London time", () => {
    expect(fmtDay("2026-01-15")).toBe("Thu 15 Jan 2026");
    expect(fmtTime("2026-01-15T09:20:00Z")).toBe("09:20");
    expect(fmtTime("2026-07-15T08:20:00Z")).toBe("09:20");
    expect(fmtStamp("2026-01-15T07:30:00Z")).toBe("Thu 15 Jan 07:30");
  });
  it("steps back one calendar day", () => {
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });
});

describe("summaryText", () => {
  it("reads as plain sentences with units and no dashes", () => {
    const t = summaryText({ day: "2026-01-15", meanGw: 11.6, minGw: 8.9, maxGw: 15.8, lowStart: "2026-01-15T16:00:00Z", lowEnd: "2026-01-15T19:00:00Z", lowMw: 8900, coverMwh: 41118, quantile: 0.75, issued: "2026-01-14T07:30:00Z", cutoff: "09:20" });
    expect(t).toContain("plan for 11.6 GW of wind");
    expect(t).toContain("Extra cover 41,118 MWh, enough in 75% of half-hours.");
    expect(t).toContain("09:20 London cutoff");
    expect(t).not.toMatch(/[—–]/);
  });
});
