# Architecture

```
  Browser (React, TanStack Query, ECharts)
        |  GET /api/decision, /accuracy, /sensitivity, /quality, /calibration, /receipt
        v
  FastAPI  main.py          validates inputs, returns Pydantic models, clean 4xx errors
        |
        v
  views.py -> engine.py     joins snapshot to domain functions, caches per parameter set
        |
        +--> domain/        selection, metrics, bands, quality, receipt   (pure, no I/O)
        |
        v
  data/loader.py            reads data/raw/*.json.gz + manifest.json       (committed snapshot)

  Refresh path, run by hand:   scripts/fetch_data.py -> data/elexon_client.py -> Elexon BMRS API
```

The running app never calls Elexon. The refresh path rewrites the snapshot and manifest, and the receipt records which snapshot a decision used.
