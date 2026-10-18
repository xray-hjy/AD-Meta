import json
import sqlite3
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from app.cli import import_dataset as importer
from app.compute.charts.boxplot import compute_boxplot
from app.compute.table import InputValidationError, prepare_dataframe
from app.core import database
from app.services.metaphlan_import import normalize_metaphlan

SPECIES = "k__Bacteria|p__Firmicutes|g__GGB123|s__GGB123_SGB456"
OTHER = "k__Bacteria|p__Bacteroidetes|g__Bacteroides|s__Bacteroides_fragilis"


def fixture(root: Path) -> tuple[Path, Path]:
    source, metadata = root / "taxonomy.tsv", root / "samples.tsv"
    source.write_text(
        "ID\tCRR1_metaphlan\tCRR2_metaphlan\tCRR3_metaphlan\tCRR4_metaphlan\n"
        "#metaphlan4\n"
        "k__Bacteria\t100\t100\t100\t100\n"
        f"{SPECIES}\t25\t30\t10\t5\n"
        f"{OTHER}\t75\t70\t90\t95\n"
        f"{SPECIES}|t__SGB456\t25\t30\t10\t5\n", encoding="utf-8",
    )
    metadata.write_text("sample_id\tGroup\nCRR4\tNC\nCRR2\tAD\nCRR1\tAD\nCRR3\tNC\n", encoding="utf-8")
    return source, metadata


def test_rank_selection_units_and_keyed_metadata_join(tmp_path):
    source, metadata = fixture(tmp_path)
    matrix, report = normalize_metaphlan(source, metadata)
    assert matrix.sample_id.tolist() == ["CRR4", "CRR2", "CRR1", "CRR3"]
    assert matrix.Group.tolist() == ["NC", "AD", "AD", "NC"]
    assert matrix[SPECIES].tolist() == [0.05, 0.3, 0.25, 0.1]
    assert list(matrix.columns) == ["sample_id", "Group", SPECIES, OTHER]
    assert np.allclose(matrix[[SPECIES, OTHER]].sum(axis=1), 1)
    assert report["excludedParentAndStrainRows"] == 2


@pytest.mark.parametrize("change", ["missing_sample", "missing_value", "bad_total", "duplicate_sample"])
def test_invalid_profiles_are_rejected(tmp_path, change):
    source, metadata = fixture(tmp_path)
    if change == "missing_sample":
        metadata.write_text("sample_id\tGroup\nCRR1\tAD\n", encoding="utf-8")
    else:
        text = source.read_text(encoding="utf-8")
        text = text.replace("25\t30", "\t30", 1) if change == "missing_value" else text
        text = text.replace("25\t30", "26\t30", 1) if change == "bad_total" else text
        text = text.replace("CRR2_metaphlan", "CRR1_metaphlan") if change == "duplicate_sample" else text
        source.write_text(text, encoding="utf-8")
    with pytest.raises(InputValidationError):
        normalize_metaphlan(source, metadata)


def test_relative_boxplots_display_percent_without_mutating_matrix(tmp_path):
    source, metadata = fixture(tmp_path)
    matrix, _ = normalize_metaphlan(source, metadata)
    normalized = tmp_path / "matrix.csv"
    matrix.to_csv(normalized, index=False)
    frame, features, _ = prepare_dataframe(normalized, abundance_scale="relative_abundance")
    payload = compute_boxplot(frame, features)
    item = next(row for row in payload["items"] if row["fullName"] == SPECIES)
    assert item["adBox"][2] == pytest.approx(27.5)
    assert payload["defaultValueTransform"] == "raw"
    assert payload["valueTransforms"][0]["label"] == "相对丰度（%）"
    assert frame[SPECIES].max() == 0.3


def test_native_profile_publishes_original_and_converted_inputs(tmp_path):
    source, metadata = fixture(tmp_path)
    original = source.read_bytes()
    db = tmp_path / "test.sqlite3"
    with patch.object(database, "DB_ENGINE", "sqlite"), patch.object(database, "DB_PATH", db), \
         patch.object(importer, "CACHE_ROOT", tmp_path / "cache"), \
         patch.object(importer, "_relative_to_backend", lambda path: str(path)):
        importer.import_dataset(source, "species", "Species", abundance_scale="relative_abundance",
                                normalization="percent / 100", input_format="metaphlan4_taxonomy",
                                sample_metadata_file=metadata)
    conn = sqlite3.connect(db)
    count, features, status = conn.execute("SELECT sample_count,feature_count,status FROM datasets").fetchone()
    raw_source = json.loads(conn.execute("SELECT source_json FROM dataset_revisions").fetchone()[0])
    assert (count, features, status) == (4, 2, "published")
    assert raw_source["preprocessing"]["storedUnit"] == "fraction"
    published = next((tmp_path / "cache" / "species").iterdir())
    assert (published / "raw.tsv").read_bytes() == original
    assert (published / "sample_metadata.tsv").read_bytes() == metadata.read_bytes()
    assert pd.read_csv(published / "analysis_matrix.csv")[SPECIES].max() == 0.3
    conn.close()
