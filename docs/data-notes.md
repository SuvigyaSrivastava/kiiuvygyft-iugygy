# Data notes (Step 0 findings)

Fetched 27 Oct 2026 from the Elexon Insights API. Every figure below came from a real pull; see `data/raw/manifest.json` for URLs, row counts and hashes.

## API
- Base: `https://data.elexon.co.uk/bmrs/api/v1/datasets/<DATASET>/stream`. No API key needed, none stored.
- Filters used: `publishDateTimeFrom`, `publishDateTimeTo` (both datasets), plus `fuelType=WIND` for FUELHH. One request per dataset covered the whole range (FUELHH about 296 KB, WINDFOR about 2.4 MB). Response is a plain JSON array. No rate-limit headers were returned.
- `startTimeFrom` / `startTimeTo` also work, but the row counts they gave for a single day were not what I expected (28 FUELHH rows for one day). I use the publish filters and trim by `startTime` afterwards.

## FUELHH, fuelType WIND (actuals)
- Fields: `startTime`, `publishTime`, `settlementDate`, `settlementPeriod`, `generation` (MW), `fuelType`, `dataset`. Times are UTC.
- Resolution 30 minutes, one row per `startTime`, no duplicates.
- 1 Jan to 1 Feb 2026 UTC: 1,536 of 1,536 expected periods present. Delivery days 2 Jan to 1 Feb: 1,488 of 1,488.
- `settlementDate` equals the UTC date of `startTime` in every row (January, no DST).
- Generation range in window: 1,695 to 17,805 MW. No zero or negative values.
- `publishTime` is normally startTime + 30 min. Three rows on 15 Jan (10:00 to 11:00 UTC) were published at 12:25 to 12:26, so a late publication day exists.

## WINDFOR (forecasts)
- Fields: `startTime`, `publishTime`, `generation` (MW), `dataset`.
- Resolution is HOURLY. Every `startTime` is on the hour. There are no half-hour forecast rows.
- Eight vintages per day. Publish times in UTC: 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30. In January, UTC equals London time.
- Each vintage holds 73 hourly targets. Horizon (startTime minus publishTime) ranges from -25.5 h to 66.5 h in the pulled range; negative values are targets earlier than the publish time and are never selected for a future target.
- No duplicate (startTime, publishTime) pairs. Generation range 2,051 to 21,353 MW.
- One irregular vintage: the 15 Jan 11:30 vintage appeared at 12:25 UTC. It is after every default cutoff, so it does not affect the default selections.

## What this means for the cutoff
Gap between publishes is 2, 3 or 4 hours. Around the plausible gate closures the vintages are 07:30 and 09:30 (then 11:30). So:
- cutoff 09:00 selects the 07:30 vintage
- cutoff 09:20 selects the 07:30 vintage
- cutoff 09:50 selects the 09:30 vintage
- cutoff 11:00 selects the 09:30 vintage
The sensitivity result is therefore binary: which side of 09:30 the cutoff falls on. The default set (09:00, 09:20, 09:50, 11:00) straddles that boundary. The next vintage after 09:30 is 11:30, which a cutoff of 11:00 still misses.

## Hourly to half-hourly rule
Default: the hourly value at T is applied to both half-hours it covers (T:00 and T:30). Linear interpolation between T and T+1h is offered as a labelled alternative. I assume the value at `startTime` T describes the hour starting at T; I could not confirm that from the docs, so the README states it as an assumption.

## Still to verify before the build is final
- Gate closure time: EPEX GB day-ahead (10:20 CET, 09:20 UK) and Nord Pool N2EX (09:50 GMT) per the build prompt. Confirm against current exchange documentation and link it in the README.
- Curtailment and farm coverage differences between FUELHH and WINDFOR cannot be separated with the allowed data. Stated as a caveat only.
