from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.cli.export_openapi import export_openapi, render_openapi
from app.core import database
from app.core.database import dispose_engine
from app.core.migrations import upgrade_database
from app.main import (
    _readiness_components,
    app,
    request_observability,
    unhandled_exception_response,
)


class OpenApiContractTests(unittest.TestCase):
    def test_openapi_check_is_read_only(self) -> None:
        with TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "openapi.json"
            output.write_text(render_openapi(), encoding="utf-8")
            self.assertTrue(export_openapi(output, check=True))

            stale = "{}\n"
            output.write_text(stale, encoding="utf-8")
            self.assertFalse(export_openapi(output, check=True))
            self.assertEqual(output.read_text(encoding="utf-8"), stale)

    def test_unhandled_errors_keep_the_request_id(self) -> None:
        test_app = FastAPI()
        test_app.add_exception_handler(Exception, unhandled_exception_response)
        test_app.middleware("http")(request_observability)

        @test_app.get("/explode")
        def explode():
            raise ValueError("original-error")

        response = TestClient(test_app, raise_server_exceptions=False).get(
            "/explode", headers={"X-Request-ID": "audit-request-id"}
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers["X-Request-ID"], "audit-request-id")
        self.assertEqual(
            response.json(),
            {"detail": "Internal Server Error", "requestId": "audit-request-id"},
        )

    def test_dataset_and_summary_contracts_are_published(self) -> None:
        schema = app.openapi()
        schemas = schema["components"]["schemas"]
        dataset = schemas["DatasetResponse"]
        summary = schemas["SummaryResponse"]
        self.assertIn("currentRevision", dataset["properties"])
        self.assertIn("analysisStatus", dataset["properties"])
        self.assertIn("availableArtifacts", dataset["properties"])
        self.assertTrue(dataset["properties"]["availableCharts"]["deprecated"])
        self.assertIn("provenance", summary["properties"])

    def test_liveness_and_readiness_have_distinct_semantics(self) -> None:
        client = TestClient(app)
        live = client.get("/api/health/live")
        self.assertEqual(live.status_code, 200)
        self.assertEqual(live.json(), {"status": "ok"})
        with patch(
            "app.main._readiness_components",
            return_value={"database": {"ok": False, "error": "down"}},
        ):
            ready = client.get("/api/health/ready")
        self.assertEqual(ready.status_code, 503)
        self.assertEqual(ready.json()["status"], "not_ready")
        self.assertTrue(live.headers.get("x-request-id"))

    def test_readiness_requires_a_published_analysis_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "empty.sqlite3"
            with (
                patch.object(database, "DB_ENGINE", "sqlite"),
                patch.object(database, "DB_PATH", db_path),
            ):
                dispose_engine()
                try:
                    upgrade_database()
                    components = _readiness_components(type("State", (), {"migration_error": None})())
                finally:
                    dispose_engine()

        self.assertFalse(components["analysisRuns"]["ok"])
        self.assertEqual(components["analysisRuns"]["publishedCount"], 0)


if __name__ == "__main__":
    unittest.main()
