from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.compute.table import InputValidationError, prepare_dataframe, validate_covariates


class InputValidationTests(unittest.TestCase):
    def _write(self, text: str, root: str) -> Path:
        path = Path(root) / "input.csv"
        path.write_text(text, encoding="utf-8")
        return path

    def _assert_code(self, text: str, code: str, **kwargs) -> InputValidationError:
        with TemporaryDirectory() as tmpdir:
            path = self._write(text, tmpdir)
            with self.assertRaises(InputValidationError) as caught:
                prepare_dataframe(path, **kwargs)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_rejects_mixed_feature_families(self) -> None:
        self._assert_code(
            "sample_id,Group,K00001,k__Bacteria|p__Firmicutes\nA,AD,1,2\nB,NC,1,2\n",
            "mixed_feature_families",
        )

    def test_rejects_duplicate_trimmed_columns(self) -> None:
        self._assert_code(
            "sample_id,Group,K00001,K00001 \nA,AD,1,2\nB,NC,1,2\n",
            "duplicate_columns",
        )

    def test_rejects_duplicate_and_empty_samples(self) -> None:
        self._assert_code(
            "sample_id,Group,K00001\nA,AD,1\nA,NC,2\n",
            "duplicate_sample_id",
        )
        self._assert_code(
            "sample_id,Group,K00001\n,AD,1\nB,NC,2\n",
            "empty_sample_id",
        )

    def test_rejects_unknown_or_numeric_groups(self) -> None:
        self._assert_code(
            "sample_id,Group,K00001\nA,case,1\nB,NC,2\n",
            "invalid_group",
        )
        self._assert_code(
            "sample_id,Group,K00001\nA,1,1\nB,0,2\n",
            "invalid_group",
        )

    def test_accepts_only_an_explicit_legacy_group_mapping(self) -> None:
        text = "sample_id,Group,K00001\nA,1,1\nB,0,2\n"
        with TemporaryDirectory() as tmpdir:
            df, _, _ = prepare_dataframe(
                self._write(text, tmpdir),
                group_mapping={"1": "AD", "0": "NC"},
            )
        self.assertEqual(df["Group"].tolist(), ["AD", "NC"])

    def test_rejects_negative_infinite_and_non_numeric_values(self) -> None:
        cases = [
            ("-1", "negative_abundance"),
            ("inf", "non_finite_abundance"),
            ("not-a-number", "non_numeric_abundance"),
        ]
        for value, expected_code in cases:
            with self.subTest(value=value):
                self._assert_code(
                    f"sample_id,Group,K00001\nA,AD,{value}\nB,NC,2\n",
                    expected_code,
                )

    def test_missing_values_require_explicit_zero_policy(self) -> None:
        text = "sample_id,Group,K00001\nA,AD,\nB,NC,2\n"
        self._assert_code(text, "missing_abundance")
        with TemporaryDirectory() as tmpdir:
            df, _, warnings = prepare_dataframe(
                self._write(text, tmpdir),
                missing_value_policy="zero",
            )
        self.assertEqual(float(df.loc[0, "K00001"]), 0.0)
        self.assertEqual(df.attrs["validation_report"]["imputedCellCount"], 1)
        self.assertEqual(len(warnings), 1)

    def test_sample_prefix_scope_filters_before_abundance_validation(self) -> None:
        text = "\n".join(
            [
                "sample_id,Group,K00001",
                "CRR1,AD,1",
                "CRR2,AD,2",
                "CRR3,NC,3",
                "CRR4,NC,4",
                "ERR1,AD,",
                "SRR1,NC,",
            ]
        )
        with TemporaryDirectory() as tmpdir:
            df, _, warnings = prepare_dataframe(
                self._write(text, tmpdir),
                minimum_group_size=2,
                sample_id_prefixes=["CRR"],
            )

        self.assertEqual(df["Sample"].tolist(), ["CRR1", "CRR2", "CRR3", "CRR4"])
        self.assertEqual(df.attrs["validation_report"]["sampleCount"], 4)
        self.assertEqual(df.attrs["validation_report"]["excludedSampleCount"], 2)
        self.assertEqual(df.attrs["validation_report"]["sampleIdPrefixes"], ["CRR"])
        self.assertEqual(df.attrs["validation_report"]["imputedCellCount"], 0)
        self.assertEqual(len(warnings), 1)

    def test_sample_prefix_scope_rejects_an_empty_selection(self) -> None:
        self._assert_code(
            "sample_id,Group,K00001\nERR1,AD,1\nERR2,NC,2\n",
            "empty_sample_selection",
            sample_id_prefixes=["CRR"],
        )

    def test_enforces_group_size_and_declared_scale(self) -> None:
        text = "sample_id,Group,K00001\nA,AD,1\nB,NC,2\n"
        self._assert_code(text, "insufficient_group_size", minimum_group_size=2)
        self._assert_code(
            "sample_id,Group,K00001\nA,AD,1.5\nB,NC,2\n",
            "invalid_count_scale",
            abundance_scale="counts",
        )
        self._assert_code(
            "sample_id,Group,K00001\nA,AD,0.5\nB,NC,2\n",
            "invalid_relative_abundance_scale",
            abundance_scale="relative_abundance",
        )

    def test_inference_eligibility_requires_five_per_group_and_known_scale(self) -> None:
        rows = ["sample_id,Group,K00001"]
        rows.extend(f"AD{i},AD,{i + 1}" for i in range(5))
        rows.extend(f"NC{i},NC,{i + 1}" for i in range(5))
        with TemporaryDirectory() as tmpdir:
            path = self._write("\n".join(rows), tmpdir)
            known, _, _ = prepare_dataframe(path, abundance_scale="counts", minimum_group_size=2)
            unknown, _, _ = prepare_dataframe(path, minimum_group_size=2)
        self.assertTrue(known.attrs["validation_report"]["inferenceEligible"])
        self.assertFalse(unknown.attrs["validation_report"]["inferenceEligible"])

    def test_validates_only_manifest_declared_covariates(self) -> None:
        text = "sample_id,Group,Age,K00001\nA,AD,70,1\nB,NC,71,2\n"
        with TemporaryDirectory() as tmpdir:
            df, features, _ = prepare_dataframe(self._write(text, tmpdir))
        validate_covariates(df, features, ["Age"])
        with self.assertRaises(InputValidationError) as missing:
            validate_covariates(df, features, ["Sex"])
        self.assertEqual(missing.exception.code, "missing_covariate")
        with self.assertRaises(InputValidationError) as reserved:
            validate_covariates(df, features, ["Group"])
        self.assertEqual(reserved.exception.code, "invalid_covariate")


if __name__ == "__main__":
    unittest.main()
