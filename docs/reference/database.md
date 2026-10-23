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

## MAG Version Tables

MAG storage is independent from Species/KO revisions because CoverM MAG percentages,
GTDB annotations, CheckM2 quality, dRep relationships, and taxonomy crosswalks have
different identities and scientific constraints.

| Table | Purpose |
|---|---|
| `mag_dataset_versions` | Immutable `mag_vN` identity, source root, package fingerprint, manifest, counts, validation result and import status. |
| `mag_package_files` | Relative path, SHA-256 and byte count for every file contributing to the version. |
| `mag_samples` | Ordered sample identity, disease, source group, batch, demographic fields, CoverM mapping percentages and input references. |
| `mag_representatives` | Ordered representative MAG IDs and genome lengths. |
| `mag_abundances` | Dense `Sample × representative MAG` CoverM percentages; all values, including zeros, are retained. |
| `mag_taxonomy` | One GTDB classification record per representative MAG. |
| `mag_quality` | One CheckM2 quality record per representative MAG. |
| `mag_clusters` | One normalized dRep secondary cluster and its representative-level parameters. |
| `mag_cluster_members` | Member-to-cluster/source relation with directional ANI, alignment coverage and member quality. |
| `mag_species_crosswalk` | One identifier-level GTDB/NCBI/Kraken-Bracken crosswalk record per representative MAG. |

`disease` remains the AD/NC analysis field. `source_group` preserves CHN/CHN2
provenance and is not an independent validation cohort. Crosswalk rows are identifier
mappings, not evidence that reads were directly aligned to a particular MAG.

## Application Support Tables

MAG DRAM2 功能证据使用不可变 SQLite 派生查询库，MySQL 的 cohort 模块修订报告存储其路径、内容 SHA-256 与字节数。派生库表为 `mags`、`features`、`counts`、`genes`、`hits`、`distill`、`info`；功能与基因按命名空间及稳定 ID 关联，运行时只读。部署必须保留发布引用的派生文件，与 MySQL 一起恢复；其构建和校验不涉及新增 MySQL 迁移。见 [MAG 功能实施记录](../development/2026-10-23-mag-functional-implementation.md)。

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
- MAG imports validate the complete package before writing, use one transaction per version, and mark the version `ready` only after exact row-count verification.
- A `version_key` cannot be overwritten with a different fingerprint. Re-importing the same version and fingerprint is idempotent.
- The selected MAG storage backend is reported as `storageBackend` in API provenance; switching package/database backends does not change the source data fingerprint.
