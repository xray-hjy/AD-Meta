# AD-Meta statistics worker

Internal-only R/Bioconductor service for formal differential abundance models.

- `counts` routes to ANCOM-BC2.
- `relative_abundance` and `normalized_abundance` route to MaAsLin2 with `NONE` normalization, `LOG` transform and `LM` analysis.
- `unknown` is rejected by the backend before a request is made.
- Requests require a validated 32-character job ID, AD/NC groups, at least five samples per group, finite non-negative abundance and a controlled `Group + covariates` formula.

The Compose service uses `expose`, not a host port, so this API is reachable only on the internal application network.

The R 4.5.2 / Bioconductor 3.21 runtime is reproducible from `renv.lock`, which records CRAN, Bioconductor, and transitive dependencies. The Docker build restores that lock before copying service code, validates it with `renv::status()`, and therefore reuses the dependency layer when only application code changes.
