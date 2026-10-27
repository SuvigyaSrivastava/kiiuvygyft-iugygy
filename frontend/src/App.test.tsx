import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as fx from "./test/fixtures";

vi.mock("./components/Chart", () => ({ Chart: ({ label }: { label: string }) => <div role="img" aria-label={label} /> }));

function mockApi() {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.split("?")[0];
    const table: Record<string, unknown> = {
      "/api/meta": fx.meta, "/api/decision": fx.decision, "/api/accuracy": fx.accuracy, "/api/sensitivity": fx.sensitivity,
      "/api/quality": fx.quality, "/api/calibration": fx.calibration,
      "/api/receipt": { input_rows_sha256: "f".repeat(64), row_count: 48, snapshot_id: "abc123", git_commit: "deadbeef", decision_timestamp_utc: "2026-01-14T09:20:00Z" },
    };
    if (!(path in table)) return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
    return new Response(JSON.stringify(table[path]), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) });
  });

  it("opens on the decision with real numbers from the API", async () => {
    mockApi();
    renderApp();
    expect(await screen.findByRole("heading", { level: 1, name: /Wind to plan around for Thu 15 Jan 2026/ })).toBeInTheDocument();
    expect(screen.getByText("11.6 GW")).toBeInTheDocument();
    expect(screen.getByText(/issued Wed 14 Jan 07:30/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Decision", selected: true })).toBeInTheDocument();
  });

  it("switches views with the tabs and keeps the settings in the URL", async () => {
    mockApi();
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("tab", { name: "Accuracy" }));
    expect(await screen.findByRole("heading", { level: 1, name: /How far off the forecast was/ })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain("view=accuracy"));
  });

  it("shows a clear message when the API rejects a request", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("/api/meta") ? new Response(JSON.stringify(fx.meta)) : new Response(JSON.stringify({ detail: "delivery_day must be from 2026-01-01 to 2026-02-01" }), { status: 404 }))));
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("delivery_day must be from 2026-01-01 to 2026-02-01");
  });

  it("moves between days with the previous and next buttons", async () => {
    const f = mockApi();
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes("delivery_day=2026-01-16"))).toBe(true));
  });
});
