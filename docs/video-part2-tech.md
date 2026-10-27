# Video part 2: technical walkthrough (about 4 minutes 45 seconds)

Show code in short, focused scrolls. Do not read it out. Bracketed lines are screen actions.

[0:00 Show docs/architecture.md, the one diagram.]

This is the walkthrough for review. One diagram first. The browser talks to a FastAPI app. FastAPI validates inputs and returns Pydantic models. Under it, an engine joins a loaded snapshot to pure functions in the domain folder. Nothing in domain touches the network or the disk.

[0:30 Open data/raw/manifest.json, then run python scripts/fetch_data.py in a terminal.]

The data is a committed snapshot of two Elexon datasets, FUELHH wind and WINDFOR. The manifest holds request URLs, fetch time, row counts and a hash of the rows. The app has no runtime dependency on Elexon. The real client still exists. This script pulls weekly windows, retries, and checks it received all 1,536 half-hours. Run twice, it writes identical files.

[1:00 Open the Data and method tab, scroll the data quality table.]

Quality checks run on the snapshot. FUELHH has no missing or duplicate periods. Three rows on 15 January were published late, so they are flagged and every metric is shown with and without them. WINDFOR is hourly, so I hold each value across both half-hours by default. Interpolation is an option, but it invents a shape the source never published. Everywhere, error is forecast minus actual, and a test pins the sign.

[1:25 Open selection.py at select_forecast_at_cutoff, then test_selection.py at the property test.]

Here is the core. WINDFOR is hourly, with eight issues a day. The rule is one line: the latest publish time at or before the cutoff. A guard function raises if any selected row breaks it. The property test builds random vintage tables and checks two things. No selected row is later than the cutoff, and moving the cutoff later never picks an older vintage for the same target.

[2:00 In the app, tick Hindsight view on the Cutoff sensitivity tab and point at the comparison.]

The hindsight toggle shows why that matters. Using the latest forecast ever published makes the error 374 megawatts smaller, and every one of those forecasts was issued after its half-hour had started. That is the flattering number a careless backtest would report.

[2:30 Open bands.py at eligible_history, then test_bands.py at the walk-forward test.]

Bands are walk-forward. For each decision day, history is only delivery days that were complete, plus a one-hour lag, before the decision time. The forecast terciles come from that history too. The test sets actuals on and after the decision day to zero and checks every band is unchanged. The first band appears on 9 January, because I require seven days.

[3:05 Switch to Data and method, scroll to the calibration chart.]

Calibration is where I tried not to flatter myself. The nominal 80 percent range held 79.8 percent of 1,152 half-hours. That hides a failure. In the mid-forecast group it held 63.8 percent, and on 28 January it held none. When wind collapses, history from windier days cannot predict it. I report that on the page instead of tuning it away.

[3:35 Run verify_receipt.py on the downloaded JSON. Edit one forecast value and run it again.]

The receipt carries the rows, assumptions, snapshot id and a hash. The verify script recomputes the selection from the snapshot. It passes on the real file and fails when I change a value.

[4:00 Show the tests folder, then .github/workflows/ci.yml.]

Testing: 72 backend tests, including metrics checked by hand, API tests on a small fixture, and January headline numbers pinned so documents cannot drift from code. Fourteen front-end tests. CI runs ruff, mypy, pytest, the front-end typecheck and build, and a Docker build with a health check. Commits are small and plain.

[4:25 Show vercel.json and the Dockerfile.]

Deployment is Vercel: a static build plus one Python function, about 115 megabytes of dependencies, and a cold start of about five seconds when I timed it locally. The Docker image runs as a non-root user with a health check.

[4:45 Back to the README.]

With more time: separate curtailment from forecast error using unit-level data, test summer months, add prices so cover can be costed in pounds, and widen bands on days when a wind collapse is forecast.
