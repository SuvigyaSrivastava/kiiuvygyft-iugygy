import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthStrip } from "./MonthStrip";
import type { Month } from "../types";

const month: Month = {
  scope: "decision_in_january",
  selection: "cutoff 09:20 London",
  days: [
    { delivery_day: "2026-01-14", mean_gw: 8, min_gw: 5, max_gw: 11, forecast_issued: "2026-01-13T07:30:00Z" },
    { delivery_day: "2026-01-15", mean_gw: 11.6, min_gw: 8.9, max_gw: 15.8, forecast_issued: "2026-01-14T07:30:00Z" },
    { delivery_day: "2026-01-16", mean_gw: null, min_gw: null, max_gw: null, forecast_issued: null },
  ],
};

describe("MonthStrip", () => {
  it("marks the chosen day and says what each bar is in words", () => {
    render(<MonthStrip month={month} selected="2026-01-15" onPick={() => {}} />);
    const on = screen.getByRole("button", { name: /Thu 15 Jan 2026, average forecast 11\.6 GW/ });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Fri 16 Jan 2026, average forecast not available/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("picks a day on click", async () => {
    const pick = vi.fn();
    render(<MonthStrip month={month} selected="2026-01-15" onPick={pick} />);
    await userEvent.click(screen.getByRole("button", { name: /Wed 14 Jan 2026/ }));
    expect(pick).toHaveBeenCalledWith("2026-01-14");
  });
});
