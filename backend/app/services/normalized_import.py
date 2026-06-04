from __future__ import annotations

import hashlib
from typing import Any, Iterable, Sequence

import pandas as pd

from app.compute.taxonomy import get_level, short_name

BATCH_SIZE = 5_000

TAXON_LEVELS = {
    "kingdom": "k",
    "phylum": "p",
    "class": "c",
    "tax_order": "o",
    "family": "f",
    "genus": "g",
    "species": "s",
}

RANK_ORDER = ("species", "genus", "family", "tax_order", "class", "phylum", "kingdom")


def _row_value(row: Any, key: str):
    if isinstance(row, dict):
        return row[key]
    return row[key]


def _chunked(rows: Iterable[tuple], size: int = BATCH_SIZE) -> Iterable[list[tuple]]:
    batch: list[tuple] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def _executemany_chunked(conn, sql: str, rows: Iterable[tuple]) -> None:
    for batch in _chunked(rows):
        conn.executemany(sql, batch)


def _phenotype(value: object) -> str:
    normalized = str(value).strip().upper()
    if normalized in {"AD", "NC"}:
        return normalized
    return "OTHER"


def _taxonomy_hash(full_taxonomy: str) -> str:
    return hashlib.sha256(full_taxonomy.encode("utf-8")).hexdigest()


def _taxonomy_payload(full_taxonomy: str) -> dict[str, str]:
    payload = {
        column: (get_level(full_taxonomy, prefix) or "").strip()
        for column, prefix in TAXON_LEVELS.items()
    }
    rank = next((rank for rank in RANK_ORDER if payload[rank]), "species")
    payload.update(
        {
            "full_taxonomy": full_taxonomy,
            "taxon_rank": "order" if rank == "tax_order" else rank,
            "canonical_name": short_name(full_taxonomy),
            "taxonomy_hash": _taxonomy_hash(full_taxonomy),
        }
    )
    return payload


def _sample_map(conn, dataset_id: int, df: pd.DataFrame) -> dict[str, int]:
    sample_rows = [
        (dataset_id, str(row.Sample), _phenotype(row.Group), "self_analysis")
        for row in df.itertuples(index=False)
    ]
    _executemany_chunked(
        conn,
        """
        INSERT INTO sample_info (dataset_id, sample_code, phenotype, data_source)
        VALUES (?, ?, ?, ?)
        """,
        sample_rows,
    )
    rows = conn.execute(
        "SELECT sample_id, sample_code FROM sample_info WHERE dataset_id = ?",
        (dataset_id,),
    ).fetchall()
    return {str(_row_value(row, "sample_code")): int(_row_value(row, "sample_id")) for row in rows}


def _ensure_taxa(conn, feature_cols: Sequence[str]) -> dict[str, int]:
    taxon_ids: dict[str, int] = {}
    for full_taxonomy in feature_cols:
        payload = _taxonomy_payload(str(full_taxonomy))
        existing = conn.execute(
            "SELECT taxon_id FROM taxon_anno WHERE taxonomy_hash = ?",
            (payload["taxonomy_hash"],),
        ).fetchone()
        if existing:
            taxon_ids[full_taxonomy] = int(_row_value(existing, "taxon_id"))
            continue

        cursor = conn.execute(
            """
            INSERT INTO taxon_anno (
              kingdom, phylum, class, tax_order, family, genus, species,
              full_taxonomy, taxon_rank, canonical_name, taxonomy_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["kingdom"],
                payload["phylum"],
                payload["class"],
                payload["tax_order"],
                payload["family"],
                payload["genus"],
                payload["species"],
                payload["full_taxonomy"],
                payload["taxon_rank"],
                payload["canonical_name"],
                payload["taxonomy_hash"],
            ),
        )
        taxon_ids[full_taxonomy] = int(cursor.lastrowid)
    return taxon_ids


def _species_rows(
    dataset_id: int,
    df: pd.DataFrame,
    feature_cols: Sequence[str],
    sample_ids: dict[str, int],
    taxon_ids: dict[str, int],
) -> Iterable[tuple[int, int, int, float]]:
    values = df[list(feature_cols)].to_numpy(dtype=float)
    for sample_code, abundances in zip(df["Sample"], values, strict=True):
        sample_id = sample_ids[str(sample_code)]
        for feature, abundance in zip(feature_cols, abundances, strict=True):
            abundance = float(abundance)
            if abundance <= 0:
                continue
            yield (dataset_id, sample_id, taxon_ids[feature], abundance)


def _ensure_kos(conn, feature_cols: Sequence[str]) -> None:
    for ko_id in feature_cols:
        existing = conn.execute("SELECT ko_id FROM ko_anno WHERE ko_id = ?", (ko_id,)).fetchone()
        if existing:
            continue
        conn.execute("INSERT INTO ko_anno (ko_id) VALUES (?)", (ko_id,))


def _ko_rows(
    dataset_id: int,
    df: pd.DataFrame,
    feature_cols: Sequence[str],
    sample_ids: dict[str, int],
) -> Iterable[tuple[int, int, str, float]]:
    values = df[list(feature_cols)].to_numpy(dtype=float)
    for sample_code, abundances in zip(df["Sample"], values, strict=True):
        sample_id = sample_ids[str(sample_code)]
        for feature, abundance in zip(feature_cols, abundances, strict=True):
            yield (dataset_id, sample_id, feature, float(abundance))


def replace_normalized_dataset(conn, dataset_id: int, df: pd.DataFrame, feature_cols: Sequence[str]) -> None:
    """Replace one dataset's normalized long-table records.

    Species abundance stores only non-zero values; KO abundance keeps zeros so
    KO matrices can be faithfully reconstructed from sparse and dense inputs.
    """

    conn.execute("DELETE FROM species_abundance WHERE dataset_id = ?", (dataset_id,))
    conn.execute("DELETE FROM ko_abundance WHERE dataset_id = ?", (dataset_id,))
    conn.execute("DELETE FROM sample_info WHERE dataset_id = ?", (dataset_id,))

    sample_ids = _sample_map(conn, dataset_id, df)
    feature_kind = str(df.attrs.get("feature_kind", "taxonomy"))

    if feature_kind == "ko":
        _ensure_kos(conn, feature_cols)
        _executemany_chunked(
            conn,
            """
            INSERT INTO ko_abundance (dataset_id, sample_id, ko_id, abundance)
            VALUES (?, ?, ?, ?)
            """,
            _ko_rows(dataset_id, df, feature_cols, sample_ids),
        )
        return

    taxon_ids = _ensure_taxa(conn, feature_cols)
    _executemany_chunked(
        conn,
        """
        INSERT INTO species_abundance (dataset_id, sample_id, taxon_id, abundance)
        VALUES (?, ?, ?, ?)
        """,
        _species_rows(dataset_id, df, feature_cols, sample_ids, taxon_ids),
    )
