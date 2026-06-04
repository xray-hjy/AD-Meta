from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterable

from .config import (
    DB_ENGINE,
    DB_PATH,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)

ISO_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?$")


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def is_mysql() -> bool:
    return DB_ENGINE == "mysql"


def _translate_placeholders(sql: str) -> str:
    return sql.replace("?", "%s")


def _normalize_mysql_param(value):
    if isinstance(value, str) and ISO_TIMESTAMP_RE.fullmatch(value):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    return value


def _normalize_mysql_params(params: Iterable | None) -> tuple:
    return tuple(_normalize_mysql_param(value) for value in (params or ()))


class MySQLConnection:
    def __init__(self):
        try:
            import pymysql
        except ImportError as exc:
            raise RuntimeError(
                "MySQL mode requires PyMySQL. Install backend requirements before using AD_META_DB_ENGINE=mysql."
            ) from exc

        self._conn = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE,
            charset="utf8mb4",
            autocommit=False,
            cursorclass=pymysql.cursors.DictCursor,
        )

    def execute(self, sql: str, params: Iterable | None = None):
        cursor = self._conn.cursor()
        cursor.execute(_translate_placeholders(sql), _normalize_mysql_params(params))
        return cursor

    def executemany(self, sql: str, params: Iterable[Iterable]):
        cursor = self._conn.cursor()
        cursor.executemany(
            _translate_placeholders(sql),
            [_normalize_mysql_params(row) for row in params],
        )
        return cursor

    def executescript(self, script: str) -> None:
        for statement in _split_sql_script(script):
            self.execute(statement)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def _split_sql_script(script: str) -> list[str]:
    statements = []
    current = []
    in_string = False
    quote = ""
    previous = ""
    for char in script:
        if char in {"'", '"'} and previous != "\\":
            if not in_string:
                in_string = True
                quote = char
            elif quote == char:
                in_string = False
        if char == ";" and not in_string:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
        else:
            current.append(char)
        previous = char
    trailing = "".join(current).strip()
    if trailing:
        statements.append(trailing)
    return statements


@contextmanager
def connect():
    if is_mysql():
        conn = MySQLConnection()
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")

    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  original_filename TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'importing',
  sample_count INTEGER NOT NULL DEFAULT 0,
  species_count INTEGER NOT NULL DEFAULT 0,
  feature_count INTEGER NOT NULL DEFAULT 0,
  feature_kind TEXT NOT NULL DEFAULT 'taxonomy',
  feature_label TEXT NOT NULL DEFAULT '物种',
  group_counts_json TEXT NOT NULL DEFAULT '{}',
  import_warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS chart_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  chart_type TEXT NOT NULL,
  cache_path TEXT NOT NULL,
  params_hash TEXT NOT NULL DEFAULT '',
  compute_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(dataset_id, chart_type),
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sample_info (
  sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  sample_code TEXT NOT NULL,
  phenotype TEXT NOT NULL,
  seq_platform TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL DEFAULT '',
  data_source TEXT NOT NULL DEFAULT 'self_analysis',
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  UNIQUE(dataset_id, sample_code)
);

CREATE TABLE IF NOT EXISTS taxon_anno (
  taxon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  kingdom TEXT NOT NULL DEFAULT '',
  phylum TEXT NOT NULL DEFAULT '',
  class TEXT NOT NULL DEFAULT '',
  tax_order TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  genus TEXT NOT NULL DEFAULT '',
  species TEXT NOT NULL DEFAULT '',
  full_taxonomy TEXT NOT NULL,
  taxon_rank TEXT NOT NULL DEFAULT 'species',
  canonical_name TEXT NOT NULL,
  taxonomy_source TEXT NOT NULL DEFAULT 'input',
  taxonomy_version TEXT NOT NULL DEFAULT '',
  taxonomy_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS species_abundance (
  abundance_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  sample_id INTEGER NOT NULL,
  taxon_id INTEGER NOT NULL,
  abundance REAL NOT NULL,
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY(sample_id) REFERENCES sample_info(sample_id) ON DELETE CASCADE,
  FOREIGN KEY(taxon_id) REFERENCES taxon_anno(taxon_id),
  UNIQUE(dataset_id, sample_id, taxon_id)
);

CREATE INDEX IF NOT EXISTS idx_species_abundance_taxon_dataset ON species_abundance(taxon_id, dataset_id);
CREATE INDEX IF NOT EXISTS idx_species_abundance_sample_dataset ON species_abundance(sample_id, dataset_id);

CREATE TABLE IF NOT EXISTS ko_anno (
  ko_id TEXT PRIMARY KEY,
  ko_name TEXT NOT NULL DEFAULT '',
  pathway TEXT NOT NULL DEFAULT '',
  module TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ko_abundance (
  ko_abundance_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  sample_id INTEGER NOT NULL,
  ko_id TEXT NOT NULL,
  abundance REAL NOT NULL,
  FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY(sample_id) REFERENCES sample_info(sample_id) ON DELETE CASCADE,
  FOREIGN KEY(ko_id) REFERENCES ko_anno(ko_id),
  UNIQUE(dataset_id, sample_id, ko_id)
);

CREATE INDEX IF NOT EXISTS idx_ko_abundance_ko_dataset ON ko_abundance(ko_id, dataset_id);
CREATE INDEX IF NOT EXISTS idx_ko_abundance_sample_dataset ON ko_abundance(sample_id, dataset_id);

CREATE TABLE IF NOT EXISTS ref_study (
  study_id TEXT PRIMARY KEY,
  data_source TEXT NOT NULL DEFAULT 'GMrepo',
  citation TEXT NOT NULL DEFAULT '',
  source_database TEXT NOT NULL DEFAULT 'GMrepo'
);

CREATE TABLE IF NOT EXISTS ref_sample_info (
  ref_sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id TEXT NOT NULL,
  data_source TEXT NOT NULL DEFAULT 'GMrepo',
  phenotype TEXT NOT NULL,
  citation TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(study_id) REFERENCES ref_study(study_id)
);

CREATE TABLE IF NOT EXISTS ad_disease_marker (
  marker_id INTEGER PRIMARY KEY AUTOINCREMENT,
  taxon_id INTEGER NOT NULL,
  study_id TEXT,
  disease TEXT NOT NULL DEFAULT 'AD',
  direction TEXT NOT NULL DEFAULT '',
  effect_metric TEXT NOT NULL DEFAULT '',
  effect_size REAL,
  sample_size INTEGER,
  p_value REAL,
  q_value REAL,
  consistency TEXT NOT NULL DEFAULT '',
  evidence_level TEXT NOT NULL DEFAULT '',
  source_database TEXT NOT NULL DEFAULT 'GMrepo',
  study_source TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(taxon_id) REFERENCES taxon_anno(taxon_id),
  FOREIGN KEY(study_id) REFERENCES ref_study(study_id)
);
"""


MYSQL_SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  file_type VARCHAR(32) NOT NULL DEFAULT '',
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'importing',
  sample_count INT UNSIGNED NOT NULL DEFAULT 0,
  species_count INT UNSIGNED NOT NULL DEFAULT 0,
  feature_count INT UNSIGNED NOT NULL DEFAULT 0,
  feature_kind VARCHAR(32) NOT NULL DEFAULT 'taxonomy',
  feature_label VARCHAR(32) NOT NULL DEFAULT '物种',
  group_counts_json JSON NULL,
  import_warnings_json JSON NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  published_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_datasets_slug (slug),
  KEY idx_datasets_status_published_at (status, published_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS chart_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  chart_type VARCHAR(64) NOT NULL,
  cache_path VARCHAR(1024) NOT NULL,
  params_hash VARCHAR(64) NOT NULL DEFAULT '',
  compute_version VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_chart_artifacts_dataset_chart (dataset_id, chart_type),
  KEY idx_chart_artifacts_dataset_id (dataset_id),
  CONSTRAINT fk_chart_artifacts_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  stage VARCHAR(64) NOT NULL DEFAULT '',
  message VARCHAR(255) NOT NULL DEFAULT '',
  error LONGTEXT NULL,
  started_at DATETIME(6) NOT NULL,
  finished_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_import_jobs_dataset_started (dataset_id, started_at),
  KEY idx_import_jobs_status_started (status, started_at),
  CONSTRAINT fk_import_jobs_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sample_info (
  sample_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  sample_code VARCHAR(128) NOT NULL,
  phenotype ENUM('AD','NC','OTHER') NOT NULL,
  seq_platform VARCHAR(128) NOT NULL DEFAULT '',
  batch_id VARCHAR(128) NOT NULL DEFAULT '',
  data_source VARCHAR(128) NOT NULL DEFAULT 'self_analysis',
  PRIMARY KEY (sample_id),
  UNIQUE KEY uk_sample_info_dataset_code (dataset_id, sample_code),
  KEY idx_sample_info_dataset_phenotype (dataset_id, phenotype),
  CONSTRAINT fk_sample_info_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS taxon_anno (
  taxon_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kingdom VARCHAR(128) NOT NULL DEFAULT '',
  phylum VARCHAR(128) NOT NULL DEFAULT '',
  class VARCHAR(128) NOT NULL DEFAULT '',
  tax_order VARCHAR(128) NOT NULL DEFAULT '',
  family VARCHAR(128) NOT NULL DEFAULT '',
  genus VARCHAR(128) NOT NULL DEFAULT '',
  species VARCHAR(255) NOT NULL DEFAULT '',
  full_taxonomy TEXT NOT NULL,
  taxon_rank VARCHAR(32) NOT NULL DEFAULT 'species',
  canonical_name VARCHAR(255) NOT NULL,
  taxonomy_source VARCHAR(64) NOT NULL DEFAULT 'input',
  taxonomy_version VARCHAR(64) NOT NULL DEFAULT '',
  taxonomy_hash CHAR(64) NOT NULL,
  PRIMARY KEY (taxon_id),
  UNIQUE KEY uk_taxon_anno_hash (taxonomy_hash),
  KEY idx_taxon_anno_canonical_name (canonical_name),
  KEY idx_taxon_anno_rank_name (taxon_rank, canonical_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS species_abundance (
  abundance_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  sample_id BIGINT UNSIGNED NOT NULL,
  taxon_id BIGINT UNSIGNED NOT NULL,
  abundance DOUBLE NOT NULL,
  PRIMARY KEY (abundance_id),
  UNIQUE KEY uk_species_abundance_dataset_sample_taxon (dataset_id, sample_id, taxon_id),
  KEY idx_species_abundance_taxon_dataset (taxon_id, dataset_id),
  KEY idx_species_abundance_sample_dataset (sample_id, dataset_id),
  CONSTRAINT fk_species_abundance_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_species_abundance_sample FOREIGN KEY (sample_id) REFERENCES sample_info(sample_id) ON DELETE CASCADE,
  CONSTRAINT fk_species_abundance_taxon FOREIGN KEY (taxon_id) REFERENCES taxon_anno(taxon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ko_anno (
  ko_id VARCHAR(16) NOT NULL,
  ko_name VARCHAR(512) NOT NULL DEFAULT '',
  pathway VARCHAR(255) NOT NULL DEFAULT '',
  module VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (ko_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ko_abundance (
  ko_abundance_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  sample_id BIGINT UNSIGNED NOT NULL,
  ko_id VARCHAR(16) NOT NULL,
  abundance DOUBLE NOT NULL,
  PRIMARY KEY (ko_abundance_id),
  UNIQUE KEY uk_ko_abundance_dataset_sample_ko (dataset_id, sample_id, ko_id),
  KEY idx_ko_abundance_ko_dataset (ko_id, dataset_id),
  KEY idx_ko_abundance_sample_dataset (sample_id, dataset_id),
  CONSTRAINT fk_ko_abundance_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ko_abundance_sample FOREIGN KEY (sample_id) REFERENCES sample_info(sample_id) ON DELETE CASCADE,
  CONSTRAINT fk_ko_abundance_ko FOREIGN KEY (ko_id) REFERENCES ko_anno(ko_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ref_study (
  study_id VARCHAR(128) NOT NULL,
  data_source VARCHAR(128) NOT NULL DEFAULT 'GMrepo',
  citation TEXT NOT NULL,
  source_database VARCHAR(128) NOT NULL DEFAULT 'GMrepo',
  PRIMARY KEY (study_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ref_sample_info (
  ref_sample_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  study_id VARCHAR(128) NOT NULL,
  data_source VARCHAR(128) NOT NULL DEFAULT 'GMrepo',
  phenotype VARCHAR(64) NOT NULL,
  citation TEXT NOT NULL,
  PRIMARY KEY (ref_sample_id),
  KEY idx_ref_sample_study_phenotype (study_id, phenotype),
  CONSTRAINT fk_ref_sample_study FOREIGN KEY (study_id) REFERENCES ref_study(study_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ad_disease_marker (
  marker_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  taxon_id BIGINT UNSIGNED NOT NULL,
  study_id VARCHAR(128) NULL,
  disease VARCHAR(128) NOT NULL DEFAULT 'AD',
  direction VARCHAR(64) NOT NULL DEFAULT '',
  effect_metric VARCHAR(64) NOT NULL DEFAULT '',
  effect_size DOUBLE NULL,
  sample_size INT UNSIGNED NULL,
  p_value DOUBLE NULL,
  q_value DOUBLE NULL,
  consistency VARCHAR(128) NOT NULL DEFAULT '',
  evidence_level VARCHAR(64) NOT NULL DEFAULT '',
  source_database VARCHAR(128) NOT NULL DEFAULT 'GMrepo',
  study_source VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (marker_id),
  KEY idx_ad_marker_taxon_disease (taxon_id, disease),
  KEY idx_ad_marker_study (study_id),
  CONSTRAINT fk_ad_marker_taxon FOREIGN KEY (taxon_id) REFERENCES taxon_anno(taxon_id),
  CONSTRAINT fk_ad_marker_study FOREIGN KEY (study_id) REFERENCES ref_study(study_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""


def _ensure_sqlite_columns(conn: sqlite3.Connection) -> None:
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(datasets)").fetchall()}
    additions = {
        "feature_count": "ALTER TABLE datasets ADD COLUMN feature_count INTEGER NOT NULL DEFAULT 0",
        "feature_kind": "ALTER TABLE datasets ADD COLUMN feature_kind TEXT NOT NULL DEFAULT 'taxonomy'",
        "feature_label": "ALTER TABLE datasets ADD COLUMN feature_label TEXT NOT NULL DEFAULT '物种'",
    }
    for column, statement in additions.items():
        if column not in existing:
            conn.execute(statement)


def init_db() -> None:
    with connect() as conn:
        conn.executescript(MYSQL_SCHEMA if is_mysql() else SQLITE_SCHEMA)
        if not is_mysql():
            _ensure_sqlite_columns(conn)


def mysql_schema_sql() -> str:
    return re.sub(r"\n{3,}", "\n\n", MYSQL_SCHEMA.strip()) + "\n"
