from __future__ import annotations

SQLITE_ANALYSIS_SCHEMA = """
CREATE TABLE IF NOT EXISTS analysis_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  manifest_version TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  pipeline_json TEXT NOT NULL DEFAULT '{}',
  parameters_json TEXT NOT NULL DEFAULT '{}',
  reference_databases_json TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS analysis_run_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  sample_code TEXT NOT NULL,
  phenotype TEXT NOT NULL,
  cohort_key TEXT NOT NULL DEFAULT '',
  source_study TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(analysis_run_id, sample_code),
  FOREIGN KEY(analysis_run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_run_samples_run_phenotype
  ON analysis_run_samples(analysis_run_id, phenotype);

CREATE TABLE IF NOT EXISTS analysis_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  artifact_key TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  dataset_id INTEGER,
  dataset_revision_id INTEGER,
  uri TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(analysis_run_id, artifact_key),
  FOREIGN KEY(analysis_run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE SET NULL,
  FOREIGN KEY(dataset_revision_id) REFERENCES dataset_revisions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_artifacts_run_type
  ON analysis_artifacts(analysis_run_id, artifact_type);

CREATE TABLE IF NOT EXISTS analysis_artifact_samples (
  artifact_id INTEGER NOT NULL,
  run_sample_id INTEGER NOT NULL,
  PRIMARY KEY(artifact_id, run_sample_id),
  FOREIGN KEY(artifact_id) REFERENCES analysis_artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY(run_sample_id) REFERENCES analysis_run_samples(id) ON DELETE CASCADE
);
"""


MYSQL_ANALYSIS_SCHEMA = """
CREATE TABLE IF NOT EXISTS analysis_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_key VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  manifest_version VARCHAR(32) NOT NULL,
  manifest_sha256 CHAR(64) NOT NULL,
  pipeline_json JSON NULL,
  parameters_json JSON NULL,
  reference_databases_json JSON NULL,
  provenance_json JSON NULL,
  created_at DATETIME(6) NOT NULL,
  completed_at DATETIME(6) NULL,
  published_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_runs_key (run_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS analysis_run_samples (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_run_id BIGINT UNSIGNED NOT NULL,
  sample_code VARCHAR(191) NOT NULL,
  phenotype VARCHAR(32) NOT NULL,
  cohort_key VARCHAR(191) NOT NULL DEFAULT '',
  source_study VARCHAR(255) NOT NULL DEFAULT '',
  metadata_json JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_run_samples_code (analysis_run_id, sample_code),
  KEY idx_analysis_run_samples_run_phenotype (analysis_run_id, phenotype),
  CONSTRAINT fk_analysis_run_samples_run FOREIGN KEY (analysis_run_id)
    REFERENCES analysis_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS analysis_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_run_id BIGINT UNSIGNED NOT NULL,
  artifact_key VARCHAR(191) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  dataset_id BIGINT UNSIGNED NULL,
  dataset_revision_id BIGINT UNSIGNED NULL,
  uri VARCHAR(1024) NOT NULL DEFAULT '',
  sha256 CHAR(64) NOT NULL DEFAULT '',
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  schema_version VARCHAR(32) NOT NULL DEFAULT '1.0',
  metadata_json JSON NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_artifacts_run_key (analysis_run_id, artifact_key),
  KEY idx_analysis_artifacts_run_type (analysis_run_id, artifact_type),
  KEY idx_analysis_artifacts_dataset_revision (dataset_revision_id),
  CONSTRAINT fk_analysis_artifacts_run FOREIGN KEY (analysis_run_id)
    REFERENCES analysis_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_artifacts_dataset FOREIGN KEY (dataset_id)
    REFERENCES datasets(id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_artifacts_revision FOREIGN KEY (dataset_revision_id)
    REFERENCES dataset_revisions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS analysis_artifact_samples (
  artifact_id BIGINT UNSIGNED NOT NULL,
  run_sample_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (artifact_id, run_sample_id),
  KEY idx_analysis_artifact_samples_sample (run_sample_id),
  CONSTRAINT fk_analysis_artifact_samples_artifact FOREIGN KEY (artifact_id)
    REFERENCES analysis_artifacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_artifact_samples_sample FOREIGN KEY (run_sample_id)
    REFERENCES analysis_run_samples(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""
