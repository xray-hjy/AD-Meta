import io
import json
import zipfile
from dataclasses import replace

import pytest
import test_gmrepo_ledger as fixtures
from test_gmrepo_primary_genus import matrix

from app.services import gmrepo_candidate_service as candidates
from app.services import gmrepo_primary_genus as primary
from app.services import gmrepo_replay_runner as runner
from app.services import gmrepo_replay_service as replay
from app.services import gmrepo_snapshot_service as snapshots

cohort = fixtures.cohort
registered = fixtures.registered


@pytest.fixture
def derived(registered, monkeypatch):
    s, a, c = matrix()
    inputs = primary.derive(s, a, c, 100)
    inputs["sourceMatrix"] = {"samples": s, "observations": a, "covariates": c, "factor": 100}
    provenance = {"sourceRevision": "test-primary", "datasetSlug": "test", "inputSha256": primary.digest(inputs), "identityBasis": "Synthetic fixture only"}
    result = {"fingerprint": primary.digest(provenance), "inputs": inputs, "statistics": primary.statistics(inputs), "provenance": provenance}
    monkeypatch.setattr(primary, "snapshot", lambda *_: result)
    return result


def test_catalog_keeps_unmapped_and_reference_only_and_does_not_change_q(registered, derived):
    data, _, _ = registered
    result = candidates.catalog(data)
    assert result["primaryFamilySize"] == 3
    assert {"unmapped", "mapped", "reference_only"} <= {r["mappingStatus"] for r in result["items"]}
    for r in result["items"]:
        if r["primaryStatistic"]:
            expected = next(v for v in derived["statistics"]["items"] if v["genus"]["featureId"] == r["candidateId"])
            assert expected == r["primaryStatistic"]
        if r["mappingStatus"] == "unmapped":
            assert all(v["statistic"] is None for v in r["cohorts"])


def test_frozen_batch_report_and_full_primary_external_replay(registered, derived, monkeypatch, tmp_path):
    data, _, _ = registered
    monkeypatch.setattr(snapshots, "SNAPSHOT_ROOT", tmp_path / "snapshots")
    ids = [r["candidateId"] for r in candidates.catalog(data)["items"]]
    fixed = candidates.evaluate(data, ids)
    assert fixed["currentStatus"]["status"] == "current"
    snapshots.validate_package(fixed)
    assert fixed["evaluationId"] in candidates.report(fixed)
    folder = tmp_path / "replay"
    with zipfile.ZipFile(io.BytesIO(replay.bundle(data, fixed))) as z:
        z.extractall(folder)
    checked = runner.verify(folder)
    assert checked["primary"]["familySize"] == 3 and checked["status"] == "passed"
    assert checked["primary"]["groupCounts"] == {"AD": 12, "NC": 12}
    tampered = json.loads((folder / "primary-inputs.json").read_bytes())
    tampered["samples"].pop()
    (folder / "primary-inputs.json").write_text(json.dumps(tampered))
    with pytest.raises(ValueError, match="Integrity"):
        runner.verify(folder)


def test_ambiguous_primary_names_do_not_remove_the_external_genus_from_catalog(registered, derived):
    data, _, _ = registered
    genera = {key: {**value, "sourceNames": [*value["sourceNames"], "GGB_1"]} if key == "NCBI:816" else value for key, value in data.genera.items()}
    result = candidates.catalog(replace(data, genera=genera))
    ambiguous = [r for r in result["items"] if r["mappingStatus"] == "ambiguous"]
    assert len(ambiguous) == 2 and all(r["referenceGenus"] is None for r in ambiguous)
    external = next(r for r in result["items"] if r["candidateId"] == "NCBI:816")
    assert external["mappingStatus"] == "reference_only" and external["primaryStatistic"] is None
    assert any(c["statistic"] for c in external["cohorts"])


@pytest.mark.parametrize("ids", [[], ["NOT-IN-CATALOG"], ["x", "x"]])
def test_invalid_candidate_selection_never_uses_defaults(registered, derived, ids):
    with pytest.raises(ValueError):
        candidates.evaluate(registered[0], ids)
