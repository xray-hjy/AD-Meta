from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DB_PATH


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
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
              FOREIGN KEY(dataset_id) REFERENCES datasets(id)
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
              FOREIGN KEY(dataset_id) REFERENCES datasets(id)
            );
            """
        )
