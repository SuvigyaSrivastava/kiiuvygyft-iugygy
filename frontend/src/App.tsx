import { useCallback, useEffect, useRef, useState } from "react";
import { useMeta } from "./api";
import { DayHeader, SettingsPanel } from "./components/ControlBar";
import { type Controls, VIEWS, type View, fromSearch, toSearch } from "./controls";
import { fmtUtcStamp } from "./format";
import { useTheme } from "./theme";
import { AccuracyView } from "./views/AccuracyView";
import { DecisionView } from "./views/DecisionView";
import { MethodView } from "./views/MethodView";
import { SensitivityView } from "./views/SensitivityView";

export default function App() {
  const [c, setC] = useState<Controls>(() => fromSearch(window.location.search));
  const meta = useMeta();
  const theme = useTheme();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const set = useCallback((patch: Partial<Controls>) => setC((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    const s = toSearch(c);
    const url = `${window.location.pathname}${s ? `?${s}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [c]);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % VIEWS.length;
    if (e.key === "ArrowLeft") next = (i - 1 + VIEWS.length) % VIEWS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = VIEWS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      set({ view: VIEWS[next].id });
      tabRefs.current[VIEWS[next].id]?.focus();
    }
  };

  const m = meta.data;
  const themeLabel = theme.choice === "system" ? "Theme: match system" : theme.choice === "light" ? "Theme: light" : "Theme: dark";

  return (
    <div className="app">
      <a href="#main" className="skip">Skip to content</a>
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">GB day-ahead wind</span>
        </div>
        <button type="button" className="theme" onClick={theme.cycle} aria-label={`${themeLabel}. Activate to change.`}>
          {theme.choice === "system" ? "Auto" : theme.choice === "light" ? "Light" : "Dark"}
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Views">
        {VIEWS.map((v: { id: View; label: string }, i) => (
          <button
            key={v.id}
            id={`tab-${v.id}`}
            ref={(el) => { tabRefs.current[v.id] = el; }}
            role="tab"
            type="button"
            aria-selected={c.view === v.id}
            aria-controls="main"
            tabIndex={c.view === v.id ? 0 : -1}
            className={c.view === v.id ? "tab on" : "tab"}
            onClick={() => set({ view: v.id })}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {c.view === "decision" && <DayHeader c={c} set={set} meta={m} />}
      <SettingsPanel c={c} set={set} meta={m} />

      <main id="main" role="tabpanel" aria-labelledby={`tab-${c.view}`} tabIndex={-1}>
        {meta.isError ? (
          <div className="state state-error" role="alert">
            <p>The data service did not answer. Reload the page in a moment.</p>
          </div>
        ) : (
          <>
            {c.view === "decision" && <DecisionView c={c} set={set} tokens={theme.tokens} />}
            {c.view === "accuracy" && <AccuracyView c={c} tokens={theme.tokens} />}
            {c.view === "sensitivity" && <SensitivityView c={c} tokens={theme.tokens} />}
            {c.view === "method" && <MethodView c={c} tokens={theme.tokens} />}
          </>
        )}
      </main>

      <footer className="foot">
        <span>Data: Elexon BMRS FUELHH (wind actuals) and WINDFOR (wind forecasts), national level.</span>
        {m && <span>Snapshot {m.snapshot.snapshot_id}, fetched {m.snapshot.fetched_at_utc ? fmtUtcStamp(m.snapshot.fetched_at_utc) : "n/a"}.</span>}
        {m && <span>Code {m.git_commit}.</span>}
        <span>Error is forecast minus actual. Positive means over-forecast.</span>
      </footer>
    </div>
  );
}
