from unittest.mock import MagicMock, patch

import pytest

from app.cli.prepare_runtime import prepare_runtime


def _connection_with_dataset_count(value: int):
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = {"value": value}
    context = MagicMock()
    context.__enter__.return_value = connection
    return context


def test_prepare_runtime_bootstraps_an_empty_database() -> None:
    with (
        patch("app.cli.prepare_runtime.upgrade_database") as upgrade,
        patch("app.cli.prepare_runtime.connect", return_value=_connection_with_dataset_count(0)),
        patch("app.cli.prepare_runtime.bootstrap_storage") as bootstrap,
        patch("app.cli.prepare_runtime.sync_analysis_runs_from_manifest") as sync,
    ):
        action = prepare_runtime()

    upgrade.assert_called_once_with()
    bootstrap.assert_called_once()
    sync.assert_not_called()
    assert action == "bootstrapped_storage"


def test_prepare_runtime_only_syncs_runs_when_datasets_exist() -> None:
    with (
        patch("app.cli.prepare_runtime.upgrade_database") as upgrade,
        patch("app.cli.prepare_runtime.connect", return_value=_connection_with_dataset_count(2)),
        patch("app.cli.prepare_runtime.bootstrap_storage") as bootstrap,
        patch("app.cli.prepare_runtime.sync_analysis_runs_from_manifest") as sync,
    ):
        action = prepare_runtime()

    upgrade.assert_called_once_with()
    bootstrap.assert_not_called()
    sync.assert_called_once()
    assert action == "synced_analysis_runs"


def test_prepare_runtime_is_safe_to_repeat_after_bootstrap() -> None:
    with (
        patch("app.cli.prepare_runtime.upgrade_database") as upgrade,
        patch(
            "app.cli.prepare_runtime.connect",
            side_effect=[_connection_with_dataset_count(0), _connection_with_dataset_count(2)],
        ),
        patch("app.cli.prepare_runtime.bootstrap_storage") as bootstrap,
        patch("app.cli.prepare_runtime.sync_analysis_runs_from_manifest") as sync,
    ):
        assert prepare_runtime() == "bootstrapped_storage"
        assert prepare_runtime() == "synced_analysis_runs"

    assert upgrade.call_count == 2
    bootstrap.assert_called_once()
    sync.assert_called_once()


def test_prepare_runtime_propagates_bootstrap_failure() -> None:
    with (
        patch("app.cli.prepare_runtime.upgrade_database"),
        patch("app.cli.prepare_runtime.connect", return_value=_connection_with_dataset_count(0)),
        patch(
            "app.cli.prepare_runtime.bootstrap_storage",
            side_effect=RuntimeError("bootstrap failed"),
        ),
        patch("app.cli.prepare_runtime.sync_analysis_runs_from_manifest") as sync,
        pytest.raises(RuntimeError, match="bootstrap failed"),
    ):
        prepare_runtime()

    sync.assert_not_called()
