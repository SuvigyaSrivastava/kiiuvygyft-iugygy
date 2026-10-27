import { describe, expect, it } from "vitest";
import { DEFAULTS, fromSearch, selectionParams, targetQuantile, toSearch } from "./controls";

describe("controls", () => {
  it("round-trips through the URL and omits defaults", () => {
    expect(toSearch(DEFAULTS)).toBe("");
    const c = { ...DEFAULTS, view: "accuracy" as const, cutoff: "09:50", ratio: 5, hindsight: true };
    const back = fromSearch(toSearch(c));
    expect(back).toEqual(c);
  });
  it("ignores bad values instead of trusting them", () => {
    const c = fromSearch("?cutoff=25:61&ratio=-4&lead=99&view=nope&day=tomorrow&scope=x&demand=abc");
    expect(c.cutoff).toBe(DEFAULTS.cutoff);
    expect(c.ratio).toBe(DEFAULTS.ratio);
    expect(c.lead).toBe(DEFAULTS.lead);
    expect(c.view).toBe("decision");
    expect(c.day).toBe(DEFAULTS.day);
    expect(c.scope).toBe(DEFAULTS.scope);
    expect(c.demand).toBe("");
  });
  it("maps the cost ratio to a target quantile", () => {
    expect(targetQuantile(3)).toBe(0.75);
    expect(targetQuantile(1)).toBe(0.5);
  });
  it("builds selection parameters for the API", () => {
    expect(selectionParams({ ...DEFAULTS, mode: "lead", lead: 12 })).toEqual({ mode: "lead", cutoff: "09:20", lead_hours: 12, interp: "hold" });
  });
});
