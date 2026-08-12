from __future__ import annotations

import pandas as pd
import pytest

from app.services.scoped_feature_catalog_service import (
    clear_scoped_feature_catalog_cache,
    get_scoped_feature_catalog,
    search_scoped_feature_catalog,
)


@pytest.fixture(autouse=True)
def clear_catalog_cache() -> None:
    clear_scoped_feature_catalog_cache()
    yield
    clear_scoped_feature_catalog_cache()


def _catalog(
    matrix: pd.DataFrame,
    *,
    sample_ids: list[int] | None = None,
):
    names = list(matrix.columns)
    return get_scoped_feature_catalog(
        revision_id=7,
        revision_key="revision-7",
        feature_kind="taxonomy",
        sample_ids=sample_ids or [1, 2],
        matrix=matrix,
        feature_names=names,
        feature_ids=[f"feature-{index}" for index in range(len(names))],
        display_names=names,
        persistent=False,
    )


def test_catalog_computes_scope_statistics_and_reuses_the_same_identity() -> None:
    matrix = pd.DataFrame(
        {
            "Alpha": [0.0, 2.0, 4.0],
            "Beta": [6.0, 0.0, 0.0],
            "Gamma": [1.0, 1.0, 1.0],
        },
        index=[1, 2, 3],
    )

    catalog = _catalog(matrix)
    repeated = _catalog(matrix.copy())

    assert repeated is catalog
    assert [entry.full_name for entry in catalog.ranked] == ["Beta", "Alpha", "Gamma"]
    beta, alpha, gamma = catalog.ranked
    assert (beta.mean_abundance, beta.detected_sample_count, beta.prevalence) == (3.0, 1, 0.5)
    assert (alpha.mean_abundance, alpha.detected_sample_count, alpha.prevalence) == (1.0, 1, 0.5)
    assert (gamma.mean_abundance, gamma.detected_sample_count, gamma.prevalence) == (1.0, 2, 1.0)

    other_scope = _catalog(matrix, sample_ids=[2, 3])
    assert other_scope.identity_key != catalog.identity_key
    assert other_scope.ranked[0].full_name == "Alpha"


def test_catalog_search_orders_exact_prefix_token_prefix_then_contains() -> None:
    matrix = pd.DataFrame(
        {
            "Alpha": [4.0, 4.0],
            "Alpha_beta": [3.0, 3.0],
            "Beta_alpha": [2.0, 2.0],
            "Zalpha": [1.0, 1.0],
            "Unrelated": [9.0, 9.0],
        },
        index=[1, 2],
    )
    catalog = _catalog(matrix)

    matched = search_scoped_feature_catalog(catalog, query="alpha")

    assert [entry.full_name for entry in matched] == [
        "Alpha",
        "Alpha_beta",
        "Beta_alpha",
        "Zalpha",
    ]


def test_catalog_rejects_misaligned_feature_metadata() -> None:
    matrix = pd.DataFrame({"Alpha": [1.0], "Beta": [2.0]}, index=[1])

    with pytest.raises(ValueError, match="feature metadata"):
        get_scoped_feature_catalog(
            revision_id=7,
            revision_key="revision-7",
            feature_kind="taxonomy",
            sample_ids=[1],
            matrix=matrix,
            feature_names=["Alpha", "Beta"],
            feature_ids=["feature-alpha"],
            display_names=["Alpha", "Beta"],
            persistent=False,
        )
