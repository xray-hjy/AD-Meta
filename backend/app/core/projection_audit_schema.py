from __future__ import annotations


SQLITE_PROJECTION_AUDIT_SCHEMA = """
CREATE TABLE IF NOT EXISTS projection_audit_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  source_artifact_id INTEGER NOT NULL,
  projection_key TEXT NOT NULL,
  projection_kind TEXT NOT NULL,
  section_key TEXT NOT NULL,
  source_revision_key TEXT NOT NULL,
  compute_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  storage_uri TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(
    source_artifact_id,
    projection_key,
    section_key,
    compute_version,
    schema_version
  ),
  FOREIGN KEY(analysis_run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(source_artifact_id) REFERENCES analysis_artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projection_audit_artifacts_lookup
  ON projection_audit_artifacts(source_artifact_id, projection_key, section_key, status);

CREATE TABLE IF NOT EXISTS projection_audit_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_artifact_id INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  feature TEXT NOT NULL DEFAULT '',
  status_code TEXT NOT NULL DEFAULT '',
  reason_code TEXT NOT NULL DEFAULT '',
  row_json TEXT NOT NULL,
  UNIQUE(audit_artifact_id, row_index),
  FOREIGN KEY(audit_artifact_id) REFERENCES projection_audit_artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projection_audit_rows_feature
  ON projection_audit_rows(audit_artifact_id, feature);

CREATE INDEX IF NOT EXISTS idx_projection_audit_rows_status_reason
  ON projection_audit_rows(audit_artifact_id, status_code, reason_code);
"""


MYSQL_PROJECTION_AUDIT_SCHEMA = """
CREATE TABLE IF NOT EXISTS projection_audit_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_run_id BIGINT UNSIGNED NOT NULL,
  source_artifact_id BIGINT UNSIGNED NOT NULL,
  projection_key CHAR(64) NOT NULL,
  projection_kind VARCHAR(64) NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  source_revision_key VARCHAR(191) NOT NULL,
  compute_version VARCHAR(64) NOT NULL,
  schema_version VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  storage_uri VARCHAR(1024) NOT NULL DEFAULT '',
  sha256 CHAR(64) NOT NULL DEFAULT '',
  row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  error_message TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  completed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_projection_audit_artifact_identity (
    source_artifact_id,
    projection_key,
    section_key,
    compute_version,
    schema_version
  ),
  KEY idx_projection_audit_artifacts_lookup (
    source_artifact_id,
    projection_key,
    section_key,
    status
  ),
  CONSTRAINT fk_projection_audit_artifacts_run FOREIGN KEY (analysis_run_id)
    REFERENCES analysis_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_projection_audit_artifacts_source FOREIGN KEY (source_artifact_id)
    REFERENCES analysis_artifacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS projection_audit_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_artifact_id BIGINT UNSIGNED NOT NULL,
  row_index BIGINT UNSIGNED NOT NULL,
  feature VARCHAR(512) NOT NULL DEFAULT '',
  status_code VARCHAR(64) NOT NULL DEFAULT '',
  reason_code VARCHAR(128) NOT NULL DEFAULT '',
  row_json JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_projection_audit_rows_index (audit_artifact_id, row_index),
  KEY idx_projection_audit_rows_feature (audit_artifact_id, feature(191)),
  KEY idx_projection_audit_rows_status_reason (
    audit_artifact_id,
    status_code,
    reason_code
  ),
  CONSTRAINT fk_projection_audit_rows_artifact FOREIGN KEY (audit_artifact_id)
    REFERENCES projection_audit_artifacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""
