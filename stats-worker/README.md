# AD-Meta statistics worker

Host-local R/Bioconductor service for formal differential abundance models.

- `counts` routes to ANCOM-BC2.
- `relative_abundance` and `normalized_abundance` route to MaAsLin2 with `NONE` normalization, `LOG` transform and `LM` analysis.
- `unknown` is rejected by the backend before a request is made.
- Requests require a validated 32-character job ID, AD/NC groups, at least five samples per group, finite non-negative abundance and a controlled `Group + covariates` formula.

The service binds to `127.0.0.1:8001` by default and should be reachable only by
the backend host. Override `AD_META_STATS_WORKER_HOST` or
`AD_META_STATS_WORKER_PORT` only when the surrounding network policy keeps the
worker private.

The R 4.5.2 / Bioconductor 3.21 runtime is reproducible from `renv.lock`, which
records CRAN, Bioconductor, and transitive dependencies. Restore it once from
this directory:

```bash
Rscript -e 'if (!requireNamespace("renv", quietly = TRUE)) install.packages("renv", repos = "https://cloud.r-project.org")'
Rscript -e 'renv::restore(project = ".", lockfile = "renv.lock", prompt = FALSE)'
```

Start the worker and run its model smoke test with:

```bash
Rscript -e 'renv::run("server.R", project = ".")'
Rscript -e 'renv::run("tests/model_smoke.R", project = ".")'
```
