# AD-Meta Database Contract

The backend supports SQLite for local development and MySQL 8.0+ for the
normalized production-style schema. MySQL uses InnoDB and `utf8mb4`.

## Core Scientific Tables

| Table | Purpose |
|---|---|
| `sample_info` | One row per dataset sample. Uses `sample_id` as the internal key and keeps the original sample name in `sample_code`. |
| `taxon_anno` | De-duplicated taxonomy annotation with kingdom through species, canonical name, rank, source fields, and `taxonomy_hash`. |
| `species_abundance` | Long-table relation among dataset, sample, taxon, and abundance. Stores non-zero species abundance values only. |
| `ko_anno` | De-duplicated KO annotation. Keeps KO ID separate from abundance rows so names/pathways are not repeated. |
| `ko_abundance` | Long-table relation among dataset, sample, KO, and abundance. Stores all KO abundance values, including zeros. |
| `ref_sample_info` | Reference sample metadata from external sources such as GMrepo. |
| `ad_disease_marker` | AD marker evidence linked to `taxon_anno`, with direction, metric, p/q values, evidence level, and source fields. |

`ref_study` is an auxiliary scientific table that stores citation/study metadata
once and is referenced by `ref_sample_info` and `ad_disease_marker`.

## Application Support Tables

| Table | Purpose |
|---|---|
| `datasets` | Dataset switching metadata, status, feature type, sample count, and group counts. |
| `chart_artifacts` | Precomputed chart JSON cache locations and compute version. |
| `import_jobs` | Import status, stage, message, and failure tracking. |

## Import Rules

- `sample_info.sample_code` is unique only within a dataset: `(dataset_id, sample_code)`.
- `species_abundance` is unique by `(dataset_id, sample_id, taxon_id)`.
- `ko_abundance` is unique by `(dataset_id, sample_id, ko_id)`.
- Taxonomy annotations are de-duplicated globally by `taxonomy_hash`.
- KO annotations are de-duplicated globally by `ko_id`.
- Public chart endpoints continue to read cached JSON rather than recalculating PCA, PCoA, heatmaps, or top-feature summaries on every request.
