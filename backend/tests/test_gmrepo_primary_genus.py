"""Scientific contract tests for primary genus aggregation and independent replay."""
from copy import deepcopy

import pytest

from app.services import gmrepo_primary_genus as primary
from app.services import gmrepo_replay_runner as runner


def matrix():
    samples, covariates, observations = [], [], []
    for i in range(24):
        sid, group = f"S{i:02}", "AD" if i < 12 else "NC"
        samples.append({"sample_code": sid, "phenotype": group})
        covariates.append({"run_accession": sid, "stage": group, "local_age": str(55 + i % 7), "local_gender": "M" if i % 2 else "F"})
        for taxon, genus, value in [(1, "Bacteroides", .2 + (i < 12) * .1), (2, "Bacteroides", .1), (3, "GGB_1", .7 - (i < 12) * .1), (4, "Zero", 0.)]:
            observations.append({"sample_code": sid, "taxon_id": taxon, "kingdom": "Bacteria", "genus": genus, "abundance": value})
    return samples, observations, covariates


def test_mass_conservation_and_unknowns_remain_in_full_family():
    s, a, c = matrix()
    result = primary.derive(s, a, c, 100)
    assert result["groupCounts"] == {"AD": 12, "NC": 12}
    assert result["massBalancePercent"] == pytest.approx([100, 100])
    assert len(result["features"]) == 3
    b = next(f for f in result["features"] if f["sourceGenus"] == "Bacteroides")
    assert b["speciesFeatureIds"] == ["1", "2"]
    assert result["samples"][0]["abundance"][b["featureId"]] == pytest.approx(40)
    assert all(r["participantId"] is None for r in result["samples"])
    stats = primary.statistics(result)
    assert stats["familySize"] == 3 and stats["adjustedCount"] == 24
    zero = next(r for r in stats["items"] if r["genus"]["sourceGenus"] == "Zero")
    assert zero["pValue"] == zero["qValue"] == 1 and zero["rankBiserial"] == 0
    assert zero["adjusted"]["status"] == "constant"


@pytest.mark.parametrize("failure", ["missing_covariate", "duplicate_sample", "wrong_group", "bad_scale", "negative", "outside"])
def test_scope_and_units_fail_closed(failure):
    s, a, c = matrix()
    if failure == "missing_covariate": c.pop()
    if failure == "duplicate_sample": s.append(s[0])
    if failure == "wrong_group": c[0]["stage"] = "NC"
    if failure == "negative": a[0]["abundance"] = -.1
    if failure == "outside": a[0]["sample_code"] = "OTHER"
    with pytest.raises(ValueError):
        primary.derive(s, a, c, 1 if failure == "bad_scale" else 100)


def test_independent_primary_replay_rederives_species_sum_and_full_statistics():
    s, a, c = matrix()
    result = primary.derive(s, a, c, 100)
    result["sourceMatrix"] = {"samples": s, "observations": a, "covariates": c, "factor": 100}
    runner.primary_derivation(result)
    expected = primary.statistics(result)
    actual = runner.calculate({"samples": result["samples"], "audit": {"unadjustedStatus": "eligible", "adjustedStatus": "eligible"}}, result["features"])
    runner.compare(actual, expected["items"])
    bad = deepcopy(result)
    bad["sourceMatrix"]["observations"].append(a[0])
    with pytest.raises(ValueError, match="Duplicate"):
        runner.primary_derivation(bad)
    bad = deepcopy(result)
    bad["samples"][0]["age"] = 99
    with pytest.raises(ValueError, match="primaryAge"):
        runner.primary_derivation(bad)


def test_ambiguous_alias_mapping_does_not_silently_merge_genera():
    s, a, c = matrix()
    result = primary.derive(s, a, c, 100)
    selected = primary.selected({"statistics": primary.statistics(result)}, {"name": "Bacteroides", "domain": "Bacteria", "sourceNames": ["GGB_1"]})
    assert selected["status"] == "ambiguous" and selected["statistic"] is None
