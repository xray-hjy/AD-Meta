import hashlib
import json
import zipfile
from pathlib import Path

import pytest

from app.cli import install_gmrepo as installer
from app.services import gmrepo_analysis_service as analysis
from app.services import gmrepo_service as reference


def _altered_bundle(tmp_path: Path, transform) -> Path:
    descriptor = installer.read_descriptor()
    source = installer.DESCRIPTOR_PATH.parent / descriptor["archive"]
    archive_path = tmp_path / descriptor["archive"]
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(archive_path, "w") as modified:
        for member in original.infolist():
            raw = original.read(member)
            changed = transform(member)
            if changed is not None:
                modified.writestr(changed, raw)
    raw = archive_path.read_bytes()
    descriptor["archive_bytes"] = len(raw)
    descriptor["archive_sha256"] = hashlib.sha256(raw).hexdigest()
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps(descriptor))
    return path


def test_fresh_install_restores_real_catalog_identity_and_source_markers(tmp_path):
    destination = tmp_path / "AD Meta" / "reference" / "2026-10-09-v1"
    assert installer.install_package(destination) == "installed"
    data = reference.load_reference_dataset(destination)
    assert len(data.samples) == 1269
    assert data.checks["complete_profiles"] == 800
    assert data.checks["plot_ready_ad_nc_runs"] == 420
    assert len(data.genera) == 322
    assert data.fingerprint == installer.read_descriptor()["fingerprint"]
    catalog = analysis.audit_catalog(data)
    eligible = {row["projectId"] for row in catalog["items"] if row["unadjustedStatus"] == "eligible"}
    assert eligible == {"PRJEB51982", "PRJEB59009"}
    assert all(row["adjustedStatus"] == "eligible" for row in catalog["items"] if row["projectId"] in eligible)
    for cohort in eligible:
        statistics = analysis.cohort_statistics(data, cohort)
        assert statistics["familySize"] == 322
        assert len(statistics["items"]) == 322
    markers = [analysis.source_markers(data, cohort, "NCBI:816") for cohort in {s["project_id"] for s in data.samples}]
    assert any(markers)


def test_existing_data_is_verified_without_writing(tmp_path):
    destination = tmp_path / "data"
    installer.install_package(destination)
    extra = destination / "local-notes.txt"
    extra.write_text("Preserve local notes.")
    before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in destination.rglob("*") if p.is_file()}
    assert installer.install_package(destination) == "already_verified"
    assert before == {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in destination.rglob("*") if p.is_file()}


@pytest.mark.parametrize("damage", ["missing_identity_evidence", "wrong_abundance"])
def test_existing_damaged_directory_is_never_overwritten(tmp_path, damage):
    destination = tmp_path / "data"
    installer.install_package(destination)
    if damage == "missing_identity_evidence":
        (destination / "evidence/PRJEB59009_author_metadata.tsv").unlink()
    else:
        (destination / "tables/genus_abundance_long.tsv").write_text("damaged")
    before = {p: p.read_bytes() for p in destination.rglob("*") if p.is_file()}
    with pytest.raises(installer.PackageError, match="left unchanged"):
        installer.install_package(destination)
    assert before == {p: p.read_bytes() for p in destination.rglob("*") if p.is_file()}


def test_corrupt_zip_is_rejected_before_creating_destination(tmp_path):
    descriptor = installer.read_descriptor()
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps(descriptor))
    (tmp_path / descriptor["archive"]).write_bytes(b"corrupt")
    destination = tmp_path / "new" / "data"
    with pytest.raises(installer.PackageError, match="SHA-256"):
        installer.install_package(destination, path)
    assert not destination.parent.exists()


def test_incomplete_zip_is_rejected_and_staging_is_cleaned(tmp_path):
    path = _altered_bundle(tmp_path, lambda member: None if member.filename.startswith("evidence/") else member)
    destination = tmp_path / "new" / "data"
    with pytest.raises(installer.PackageError, match="file list"):
        installer.install_package(destination, path)
    assert list(destination.parent.iterdir()) == []


@pytest.mark.parametrize("bad_path", ["../escape", "/absolute", "C:/escape", "tables\\escape"])
def test_unsafe_zip_paths_cannot_escape_staging(tmp_path, bad_path):
    def rename(member):
        if member.filename == "data_contract.json":
            member.filename = bad_path
        return member
    path = _altered_bundle(tmp_path, rename)
    destination = tmp_path / "new" / "data"
    with pytest.raises(installer.PackageError, match="Unsafe package path"):
        installer.install_package(destination, path)
    assert list(destination.parent.iterdir()) == []
    assert not (tmp_path / "escape").exists()


def test_zip_symlink_is_rejected(tmp_path):
    def symlink(member):
        if member.filename == "data_contract.json":
            member.external_attr = 0o120777 << 16
        return member
    path = _altered_bundle(tmp_path, symlink)
    destination = tmp_path / "new" / "data"
    with pytest.raises(installer.PackageError, match="Invalid GMrepo ZIP entry"):
        installer.install_package(destination, path)
    assert list(destination.parent.iterdir()) == []


def test_auto_install_preserves_custom_configuration(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["install_gmrepo", "--auto", "--destination", str(tmp_path / "custom")])
    installer.main()
    assert not (tmp_path / "custom").exists()
    assert "custom data root preserved" in capsys.readouterr().out
