import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services import analysis_run_presentation as presentation


def test_configured_names_and_selection_do_not_change_result_identity():
    keys = ["ad-nc-community-metaphlan4-2026-10-16", "ad-nc-community-crr-only-2026-09", "ad-nc-community-diting-2026-10-16"]
    runs = [{"key": key, "name": key, "sampleCount": 7, "artifacts": [{"datasetRevision": key}]} for key in keys]
    result = presentation.present_analysis_runs(runs)
    assert [run["name"] for run in result if run["selectorVisible"]] == ["AD/NC 群落分析", "AD/NC 群落分析（旧版）"]
    assert result[0]["isDefault"] is True
    assert result[-1]["key"] == keys[0]
    assert result[-1]["selectorVisible"] is False
    for source in runs:
        target = next(run for run in result if run["key"] == source["key"])
        assert target["artifacts"] == source["artifacts"]
        assert target["sampleCount"] == source["sampleCount"]
        assert source["name"] == source["key"]  # no mutation of stored metadata


def test_future_unconfigured_results_keep_name_and_remain_selectable():
    result = presentation.present_analysis_runs([{"key": "future", "name": "Future analysis"}])[0]
    assert result == {"key": "future", "name": "Future analysis", "selectorVisible": True, "isDefault": False}


@pytest.mark.parametrize("runs", [
    {"a": {"isDefault": True}, "b": {"isDefault": True}},
    {"a": {"isDefault": True, "selectorVisible": False}},
])
def test_invalid_default_policy_is_rejected(runs):
    with patch.object(Path, "read_text", return_value=json.dumps({"runs": runs})):
        with pytest.raises(ValueError, match="default run"):
            presentation.present_analysis_runs([])
