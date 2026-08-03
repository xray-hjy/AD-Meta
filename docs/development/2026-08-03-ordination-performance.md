# PCA and PCoA performance update

## Problem

PCA and PCoA repeatedly loaded the complete long-form abundance table from MySQL and rebuilt the same sample-by-feature matrix. A cold request could therefore spend most of its time fetching and pivoting millions of rows before the ordination algorithm started. Hover prefetch could also launch PCA and PCoA concurrently and saturate the single local backend worker.

## Stable cache boundaries

The optimization keeps three different cache layers with explicit ownership:

1. **Revision matrix snapshot**: a complete, immutable sample-by-feature matrix for one published artifact revision. It does not apply Top N, abundance filtering, merging, or analysis-scope selection.
2. **Projection result cache**: the result for one projection identity, including scope, parameters, compute version, and artifact revision.
3. **Frontend query cache**: a short-lived browser cache for already requested API responses.

The matrix snapshot is a derived local artifact under `backend/storage/cache/projections/matrices`. It may be deleted at any time and can be rebuilt from MySQL without losing scientific data. Published revision identity is part of its key, so a new revision cannot reuse an old matrix.

## Request behavior

- Concurrent identical cold projection requests use single-flight locking and share one computation.
- PCA and PCoA reuse the same complete revision matrix before applying their own scope and scientific filtering rules.
- Hovering or focusing their navigation entries no longer starts an expensive request. Actual navigation still requests the selected projection.
- The local startup tool warms the shared matrix and default PCA/PCoA projections before opening the frontend.

Manual prewarm command:

```powershell
cd G:\admeta\backend
.\.venv\Scripts\python.exe -m app.cli.warm_projection_cache --projection pca --projection pcoa --skip-abundance --skip-audits
```

The first build after a new data revision or cache cleanup can take longer. Subsequent backend processes load the complete matrix snapshot directly and only compute the requested scope and projection.
