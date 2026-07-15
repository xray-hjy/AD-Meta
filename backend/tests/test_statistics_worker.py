from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

import pandas as pd

from app.services import statistics_worker


class StatisticsWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.df = pd.DataFrame(
            {
                "Sample": [f"AD{i}" for i in range(5)] + [f"NC{i}" for i in range(5)],
                "Group": ["AD"] * 5 + ["NC"] * 5,
                "Age": list(range(60, 70)),
                "K00001": [10, 9, 8, 10, 9, 1, 2, 1, 2, 1],
            }
        )

    def test_routes_declared_scales_to_expected_model(self) -> None:
        self.assertEqual(statistics_worker.method_for_scale("counts"), "ancombc2")
        self.assertEqual(statistics_worker.method_for_scale("relative_abundance"), "maaslin2")
        self.assertEqual(statistics_worker.method_for_scale("normalized_abundance"), "maaslin2")
        self.assertIsNone(statistics_worker.method_for_scale("unknown"))

    def test_builds_controlled_formula_and_maaslin_parameters(self) -> None:
        payload = statistics_worker.build_differential_request(
            job_id="a" * 32,
            df=self.df,
            feature_cols=["K00001"],
            abundance_scale="relative_abundance",
            covariates=["Age"],
        )
        self.assertEqual(payload["formula"], "Group + Age")
        self.assertEqual(payload["method"], "maaslin2")
        self.assertEqual(
            payload["parameters"],
            {"normalization": "NONE", "transform": "LOG", "analysisMethod": "LM"},
        )
        self.assertEqual(len(payload["matrix"]), 10)

    def test_validates_worker_response_contract(self) -> None:
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "method": "ANCOM-BC2",
            "modelFormula": "Group + Age",
            "items": [
                {
                    "featureId": "K00001",
                    "pValue": 0.001,
                    "qValue": 0.01,
                    "effectSize": 1.2,
                    "effectMetric": "ancombc2_log_fold_change",
                }
            ],
        }
        with patch.object(statistics_worker, "STATS_WORKER_URL", "http://stats-worker:8001"), patch.object(
            statistics_worker.httpx, "post", return_value=response
        ) as post:
            result = statistics_worker.run_formal_differential(
                job_id="a" * 32,
                df=self.df,
                feature_cols=["K00001"],
                abundance_scale="counts",
                covariates=["Age"],
            )
        self.assertEqual(result["inferenceLevel"], "formal_compositional_model")
        self.assertEqual(result["items"][0]["qValue"], 0.01)
        self.assertEqual(post.call_args.args[0], "http://stats-worker:8001/v1/differential-abundance")

    def test_known_scale_fails_closed_without_worker(self) -> None:
        with patch.object(statistics_worker, "STATS_WORKER_URL", ""):
            with self.assertRaisesRegex(statistics_worker.FormalAnalysisError, "not configured"):
                statistics_worker.run_formal_differential(
                    job_id="a" * 32,
                    df=self.df,
                    feature_cols=["K00001"],
                    abundance_scale="counts",
                    covariates=[],
                )

    def test_rejects_unknown_scale_and_invalid_worker_items(self) -> None:
        with self.assertRaisesRegex(statistics_worker.FormalAnalysisError, "No formal model"):
            statistics_worker.build_differential_request(
                job_id="a" * 32,
                df=self.df,
                feature_cols=["K00001"],
                abundance_scale="unknown",
                covariates=[],
            )
        invalid_payloads = [
            None,
            {"items": [{}]},
            {"items": [{"featureId": "K00001", "pValue": "bad", "qValue": 1, "effectSize": 0}]},
            {"items": [{"featureId": "K00001", "pValue": 0.1, "qValue": float("inf"), "effectSize": 0}]},
            {"items": [{"featureId": "K00001", "pValue": 0.1, "qValue": 1.5, "effectSize": 0}]},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(statistics_worker.FormalAnalysisError):
                    statistics_worker._validated_result(payload, "ancombc2", "Group")

    def test_wraps_worker_transport_failures(self) -> None:
        with patch.object(statistics_worker, "STATS_WORKER_URL", "http://stats-worker:8001"), patch.object(
            statistics_worker.httpx, "post", side_effect=statistics_worker.httpx.ConnectError("down")
        ):
            with self.assertRaisesRegex(statistics_worker.FormalAnalysisError, "worker failed"):
                statistics_worker.run_formal_differential(
                    job_id="a" * 32,
                    df=self.df,
                    feature_cols=["K00001"],
                    abundance_scale="counts",
                    covariates=[],
                )


if __name__ == "__main__":
    unittest.main()
