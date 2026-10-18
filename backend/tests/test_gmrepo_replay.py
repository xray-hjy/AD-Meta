import io
import json
import zipfile

import pytest
import test_gmrepo_ledger as fixtures

from app.services import gmrepo_evaluation_service as evaluation
from app.services import gmrepo_replay_runner as runner
from app.services import gmrepo_replay_service as replay
from app.services import gmrepo_snapshot_service as snapshots

cohort = fixtures.cohort
registered = fixtures.registered


def test_standalone_recomputes_full_family_not_selected_feature(registered, tmp_path, monkeypatch):
    data, _, _ = registered
    monkeypatch.setattr(snapshots, "SNAPSHOT_ROOT", tmp_path / "snapshots")
    fixed = snapshots.freeze(evaluation.evidence_summary(data, "NCBI:816"))
    target = tmp_path / "extracted"
    with zipfile.ZipFile(io.BytesIO(replay.bundle(data, fixed))) as archive:
        archive.extractall(target)
    result = runner.verify(target)
    assert result["status"] == "passed"
    assert result["cohorts"][0]["computedFeatures"] == len(data.genera)
    raw = json.loads((target / "inputs.json").read_bytes())
    raw["cohorts"][0]["samples"][0]["group"] = "NC"
    (target / "inputs.json").write_text(json.dumps(raw))
    with pytest.raises(ValueError, match="Integrity failure"):
        runner.verify(target)


def test_changed_registry_cannot_generate_replay_for_old_snapshot(registered, tmp_path, monkeypatch):
    data, path, payload = registered
    monkeypatch.setattr(snapshots, "SNAPSHOT_ROOT", tmp_path / "snapshots")
    fixed = snapshots.freeze(evaluation.evidence_summary(data, "NCBI:816"))
    payload["purpose"] = "new scope"
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="历史评估"):
        replay.bundle(data, fixed)
