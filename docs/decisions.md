# Decisions

One line of reasoning each. Most recent state of the build, not a history.

## Domain
- Decision day D is 1 to 31 Jan 2026, delivery days 2 Jan to 1 Feb. This is the literal reading of "decisions made in January". The delivery-in-January variant is one control away, because the brief is ambiguous.
- Default cutoff 09:20 London. EPEX moved the GB auction to 09:20 GMT in 2021 and Nord Pool states 09:50 GMT, so both sit inside the tested set. Hardcoding 09:00 or 11:00 would be a guess.
- Selection uses `publishTime <= cutoff` (inclusive). A forecast published at the exact cutoff minute is treated as available, because gate closure is the last moment to submit and a result at that moment is already in hand.
- Ties on `(startTime, publishTime)` take the later source row. None exist in the January data, and the quality report counts them.
- Hourly WINDFOR is held across both half-hours by default. It adds no information that the source did not have. Interpolation is a labelled option.
- Lead-time mode uses `publishTime <= startTime - h` per half-hour. For band history the decision timestamp is the start of the delivery day minus h, which is the earliest decision in the day, so the history is conservative.
- Bands: error quantiles per forecast tercile, terciles from history only, at least 7 delivery days, 1 hour publication lag, buckets under 20 samples fall back to all history. Chosen to be simple enough to defend, not tuned on this month.
- Cover = r/(1+r) quantile of over-forecast error, floored at zero. It is the newsvendor critical ratio applied to an empirical error distribution.
- The hindsight series is the latest forecast of any publish time. In this data every half-hour has such a row published after it began, so it behaves like a backcast. The UI says this.
- Flagged periods are actuals that are non-positive, duplicated or published over an hour late. Three late rows exist (15 Jan). Metrics are shown with and without them.

## Data
- The app reads a committed snapshot and never calls Elexon at runtime. This keeps the deployed app reproducible, fast and independent of rate limits. The live client and `scripts/fetch_data.py` keep the refresh path real, and the manifest carries URLs and hashes.
- Publish-time filters (`publishDateTimeFrom` and `To`) are used instead of start-time filters, because the start-time filter returned an unexpected row count in a probe. The script trims by `startTime` afterwards and checks that all 1,536 FUELHH periods exist.
- Weekly request windows with a short pause, four retries on 429 and 5xx. Same inputs produce byte-identical files.

## Stack
- FastAPI, Pydantic models on every response, pandas for tables. The data is tiny, so clarity wins over speed.
- Compute per request with `lru_cache` keyed on the selection settings, not precomputed at build time. The whole analysis takes well under a second warm, and precomputing would fix the controls to a grid.
- Vite, React, TypeScript, TanStack Query, ECharts (tree-shaken, about 186 KB gzipped). No component library. Plain CSS with a small token set.
- Charts follow the dataviz skill: blue for the forecast, orange for actual wind and the hindsight series, red and blue only in the error histogram. Orange and red fail the colour-blind separation check together, so they are never in one chart. Every chart has a table view or a table beside it.
- System font stack. A web font would add a network dependency for no gain in a numbers-first tool.
- Chart time axes use UTC. That equals London in January, which is all the snapshot holds. Text times use `Europe/London` explicitly.
- No ESLint. `tsc --strict` with unused-variable checks and tests are the front-end gates.

## Delivery
- Vercel, static front end plus one Python function. It is free, needs no always-on process, and the dependency set (about 115 MB) fits the function limit. Heroku with the Dockerfile is the fallback.
- Credentials are never handled here. Deploy commands are in the README and the checklist.
- Docker: multi-stage, non-root user, health check.
