from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class OpenApiContractTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
