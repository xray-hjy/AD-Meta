# AD-Meta Database Contract

The locally installed MySQL 8.0+ server is the default application database. Tables use InnoDB and
`utf8mb4`. SQLite is retained only as a legacy migration source and as a fast,
isolated backend for unit tests.

## Core Scientific Tables

| Table | Purpose |
|---|---|
| `revision_sample_info` | Immutable sample rows scoped to one dataset revision. |
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
| `datasets` | Stable slug plus `current_revision_id`, status, feature type, counts and current provenance. |
| `dataset_revisions` | Immutable source checksum, scale, policies, model parameters, validation report and publication status. |
| `revision_chart_artifacts` | Revision-scoped cache path, SHA-256 and byte size. |
| `revision_species_abundance` / `revision_ko_abundance` | Immutable normalized abundance rows for a revision. |
| `chart_artifacts` / legacy normalized tables | One-cycle compatibility mirror of the current revision. |
| `import_jobs` | Import status, stage, message, and failure tracking. |

## Import Rules

- `sample_info.sample_code` is unique only within a dataset: `(dataset_id, sample_code)`.
- `species_abundance` is unique by `(dataset_id, sample_id, taxon_id)`.
- `ko_abundance` is unique by `(dataset_id, sample_id, ko_id)`.
- Taxonomy annotations are de-duplicated globally by `taxonomy_hash`.
- KO annotations are de-duplicated globally by `ko_id`.
- Public chart endpoints continue to read cached JSON rather than recalculating PCA, PCoA, heatmaps, or top-feature summaries on every request.
- Imports write `storage/staging/<revision>` first and switch `datasets.current_revision_id` only after cache and database validation succeed.
- The default retention policy keeps the latest three successful revisions and all failed job metadata.
- Alembic owns production schema versioning; SQLAlchemy 2 supplies SQLite/MySQL pooling and transaction boundaries.
