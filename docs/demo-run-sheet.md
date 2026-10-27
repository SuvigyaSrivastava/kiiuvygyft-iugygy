# Demo run sheet

Goal: one clean take for each part. Use the deployed app in a fresh window, 1280 px wide or larger, light theme, browser zoom 100%. Settings that are not listed stay at their defaults (Decided in January, cutoff 09:20, cost ratio 3, hold the hourly value).

Direct links save clicks. Replace `APP` with the live URL.

| Step | Link or action |
|---|---|
| Decision, 15 Jan | `APP/?day=2026-01-15` |
| Same day with hindsight | tick "Hindsight view" (the link becomes `APP/?day=2026-01-15&hindsight=1`) |
| Bad day, 28 Jan | `APP/?day=2026-01-28&hindsight=1` |
| Accuracy | `APP/?view=accuracy` |
| Cutoff sensitivity | `APP/?view=sensitivity` |
| Data and method | `APP/?view=method` |

## Before recording
1. Open `APP/api/health` and check it says `{"status":"ok"}`. Then open the app once so the function is warm. The first request after idle can take several seconds.
2. Close other tabs. Turn off notifications.
3. Have a terminal open in the repo with the Python environment ready, and the repo open in an editor with these files in tabs, in this order: `docs/architecture.md`, `data/raw/manifest.json`, `backend/app/domain/selection.py`, `tests/test_selection.py`, `backend/app/domain/bands.py`, `tests/test_bands.py`, `.github/workflows/ci.yml`, `vercel.json`, `Dockerfile`.
4. Download one receipt first: `APP/api/receipt?delivery_day=2026-01-15&cutoff=09:20` saved as `receipt_2026-01-15_0920.json`, in the repo root, for the verify demo. Make a second copy with one `forecast_mw` value edited by 1 for the failing run.

## Part 1, customer (target 4:30)
1. 0:00 Open `APP/?day=2026-01-15`. Wait for the chart. Check the heading reads "Wind to plan around for Thu 15 Jan 2026" and the big figure reads 11.6 GW.
2. 0:30 Point to the 11.6 GW figure, then "Lowest-wind three hours" (16:00 to 19:00, 8.9 GW).
3. 1:00 Point to the shaded range, then the bar chart under it.
4. 1:25 In the control bar set "Cost of short / cost of surplus" to 1, wait a second, then back to 3. Extra cover returns to 41,118 MWh.
5. 1:55 Tick "Hindsight view". Orange lines appear. The note under the chart gives the day's miss.
6. 2:20 Click the Accuracy tab. Rest on 2,042 MW, then the +1,748 MW bias line, then the chart.
7. 2:55 Scroll to "Error by hour of day", then "Error by forecast level".
8. 3:10 Go to `APP/?day=2026-01-28&hindsight=1`. Point at the gap between blue and orange.
9. 3:35 Click Cutoff sensitivity. Point at the table rows: 09:00 and 09:20 match, 09:50 and 11:00 match. Then the forecast-age chart.
10. 3:55 Click Data and method. Scroll to Decision receipt. Click Download CSV.
11. 4:15 Back to Accuracy, rest on the headline numbers.

## Part 2, tech lead (target 4:45)
1. 0:00 `docs/architecture.md` in the editor.
2. 0:30 `data/raw/manifest.json`, then in the terminal: `python scripts/fetch_data.py`. It takes about 10 seconds. If the network is slow, show the output of an earlier run instead and say so.
3. 1:00 Data and method tab in the app, data quality table. Then the editor.
4. 1:25 `selection.py`, function `select_forecast_at_cutoff`, then `enforce_publish_limit`. Then `tests/test_selection.py`, the property test at the bottom.
5. 2:00 Cutoff sensitivity tab, section "What hindsight does to accuracy".
6. 2:30 `bands.py`, function `eligible_history`. Then `tests/test_bands.py`, `test_walk_forward_ignores_future_actuals`.
7. 3:05 Data and method tab, "Is the range honest?". Point at the 28 Jan gap and the mid-forecast row (63.8%).
8. 3:35 Terminal: `python scripts/verify_receipt.py receipt_2026-01-15_0920.json` (OK). Then the edited copy (FAILED).
9. 4:00 Terminal: `pytest -q` (shows 72 passed). Then `.github/workflows/ci.yml`.
10. 4:25 `vercel.json`, then `Dockerfile`.
11. 4:45 README, then stop.

## If something looks different on the day
Every figure in the scripts comes from the committed snapshot, so they should repeat exactly. If a number on screen differs from the script, the snapshot or the settings changed. Check the footer snapshot id (`20dffcec0e0f` at the time of writing) and fix the script, not the screen.
