from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pandas as pd

from app.compute.precompute import (
    _box_values,
    _hierarchical_cluster,
    compute_boxplot,
    compute_detection_heatmap,
    compute_heatmap,
    compute_ko_lda,
    compute_sunburst,
    prepare_dataframe,
    precompute_all,
)


class KoAbundancePrecomputeTests(unittest.TestCase):
    def test_prepares_ko_table_with_label_group_column(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "ko.csv"
            path.write_text(
                "\n".join(
                    [
                        "sample_id,label,K00001,K00003",
                        "AD001,AD,10,1",
                        "NC001,NC,2,8",
                    ]
                ),
                encoding="utf-8",
            )

            df, feature_cols, warnings = prepare_dataframe(path)

        self.assertEqual(feature_cols, ["K00001", "K00003"])
        self.assertEqual(df["Group"].tolist(), ["AD", "NC"])
        self.assertEqual(df["Sample"].tolist(), ["AD001", "NC001"])
        self.assertEqual(warnings, [])

    def test_prepares_binary_label_group_column_as_ad_nc(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "ko.csv"
            path.write_text(
                "\n".join(
                    [
                        "sample_id,label,K00001,K00003",
                        "AD001,1,10,1",
                        "NC001,0,2,8",
                    ]
                ),
                encoding="utf-8",
            )

            df, _, _ = prepare_dataframe(path)

        self.assertEqual(df["Group"].tolist(), ["AD", "NC"])

    def test_ko_summary_uses_function_feature_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "ko.csv"
            path.write_text(
                "\n".join(
                    [
                        "sample_id,label,K00001,K00003,K00005",
                        "AD001,AD,10,1,0",
                        "AD002,AD,9,2,1",
                        "NC001,NC,2,8,4",
                        "NC002,NC,3,7,5",
                    ]
                ),
                encoding="utf-8",
            )

            summary, artifacts, warnings = precompute_all(
                path,
                "ad-ko-abundance",
                "AD KO Abundance",
                "2026-06-02T00:00:00+00:00",
            )

        self.assertEqual(warnings, [])
        self.assertEqual(summary["featureKind"], "ko")
        self.assertEqual(summary["featureLabel"], "KO")
        self.assertEqual(summary["totalFeatures"], 3)
        self.assertEqual(summary["totalSpecies"], 3)
        self.assertEqual(artifacts["species"][0]["species"], "K00001")
        self.assertIn("phylum", artifacts)
        self.assertIn("detection", artifacts)
        self.assertNotIn("sunburst", artifacts)


class TaxonomySunburstPrecomputeTests(unittest.TestCase):
    def test_merges_low_abundance_species_without_changing_parent_total(self) -> None:
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "species.csv"
            path.write_text(
                "\n".join(
                    [
                        ",".join(
                            [
                                "sample_id",
                                "Group",
                                "k__Bacteria|p__Firmicutes|c__Bacilli|g__Roseburia|s__Roseburia_major_a",
                                "k__Bacteria|p__Firmicutes|c__Bacilli|g__Roseburia|s__Roseburia_major_b",
                                "k__Bacteria|p__Firmicutes|c__Bacilli|g__Roseburia|s__Roseburia_major_c",
                                "k__Bacteria|p__Firmicutes|c__Bacilli|g__Roseburia|s__Roseburia_minor_a",
                                "k__Bacteria|p__Firmicutes|c__Bacilli|g__Roseburia|s__Roseburia_minor_b",
                            ]
                        ),
                        "AD001,AD,100,90,80,2,1",
                        "NC001,NC,0,0,0,0,0",
                    ]
                ),
                encoding="utf-8",
            )

            df, feature_cols, _ = prepare_dataframe(path)
            sunburst = compute_sunburst(df, feature_cols)

        phylum = sunburst[0]
        genus = phylum["children"][0]["children"][0]
        children = genus["children"]
        child_names = [child["name"] for child in children]
        child_total = sum(float(child["value"]) for child in children)

        self.assertEqual(genus["name"], "Roseburia")
        self.assertIn("Other species", child_names)
        self.assertEqual(len(children), 4)
        self.assertAlmostEqual(child_total, float(genus["value"]))
        other = next(child for child in children if child["name"] == "Other species")
        self.assertEqual(other["mergedCount"], 2)
        self.assertEqual(other["rank"], "species")
        self.assertAlmostEqual(other["value"], 3.0)

    def test_limits_class_children_and_keeps_major_classes_visible(self) -> None:
        class_features = [
            f"k__Bacteria|p__Firmicutes|c__Class_{index}|g__Genus_{index}|s__Species_{index}"
            for index in range(1, 7)
        ]
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "species.csv"
            path.write_text(
                "\n".join(
                    [
                        ",".join(["sample_id", "Group", *class_features]),
                        "AD001,AD,100,90,80,70,60,50",
                        "NC001,NC,0,0,0,0,0,0",
                    ]
                ),
                encoding="utf-8",
            )

            df, feature_cols, _ = prepare_dataframe(path)
            sunburst = compute_sunburst(df, feature_cols)

        phylum = sunburst[0]
        class_children = phylum["children"]
        class_names = [child["name"] for child in class_children]

        self.assertLessEqual(len(class_children), 5)
        self.assertEqual(class_names[:4], ["Class_1", "Class_2", "Class_3", "Class_4"])
        self.assertIn("Other classes", class_names)
        other = next(child for child in class_children if child["name"] == "Other classes")
        self.assertEqual(other["mergedCount"], 2)
        self.assertAlmostEqual(sum(float(child["value"]) for child in class_children), float(phylum["value"]))


class HeatmapPrecomputeTests(unittest.TestCase):
    def test_heatmap_ranks_candidates_by_score_not_p_value_alone(self) -> None:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "AD", "NC", "NC", "NC"],
                "Sample": ["AD1", "AD2", "AD3", "NC1", "NC2", "NC3"],
                "k__Bacteria|p__A|c__A|g__A|s__low_fc": [4, 4, 4, 1, 1, 1],
                "k__Bacteria|p__B|c__B|g__B|s__high_fc": [1024, 1024, 1024, 1, 1, 1],
            }
        )
        species_cols = [
            "k__Bacteria|p__A|c__A|g__A|s__low_fc",
            "k__Bacteria|p__B|c__B|g__B|s__high_fc",
        ]
        p_values = [SimpleNamespace(pvalue=0.001), SimpleNamespace(pvalue=0.02)]

        with patch("app.compute.precompute.mannwhitneyu", side_effect=p_values):
            heatmap = compute_heatmap(df, species_cols)

        self.assertEqual(heatmap["stats"][0]["fullName"], species_cols[1])
        self.assertIn("score", heatmap["stats"][0])

    def test_heatmap_includes_all_significant_features_until_safety_cap(self) -> None:
        feature_count = 36
        samples = [f"AD{i}" for i in range(6)] + [f"NC{i}" for i in range(6)]
        df = pd.DataFrame({"Group": ["AD"] * 6 + ["NC"] * 6, "Sample": samples})
        species_cols = []
        for index in range(feature_count):
            col = f"k__Bacteria|p__P{index}|c__C{index}|g__G{index}|s__S{index}"
            species_cols.append(col)
            df[col] = [100 + index] * 6 + [1] * 6

        heatmap = compute_heatmap(df, species_cols)

        self.assertEqual(len(heatmap["stats"]), feature_count)
        self.assertEqual(heatmap["filter"]["maxFeatures"], 200)

    def test_heatmap_caches_hierarchical_column_order_metadata(self) -> None:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "AD", "AD", "NC", "NC", "NC", "NC"],
                "Sample": ["AD1", "AD2", "AD3", "AD4", "NC1", "NC2", "NC3", "NC4"],
                "k__Bacteria|p__A|c__A|g__A|s__A": [50, 52, 51, 53, 1, 1, 1, 1],
                "k__Bacteria|p__B|c__B|g__B|s__B": [48, 50, 49, 51, 1, 1, 1, 1],
                "k__Bacteria|p__C|c__C|g__C|s__C": [1, 1, 1, 1, 60, 62, 61, 63],
                "k__Bacteria|p__D|c__D|g__D|s__D": [1, 1, 1, 1, 58, 60, 59, 61],
                "k__Bacteria|p__E|c__E|g__E|s__E": [30, 31, 32, 33, 1, 1, 1, 1],
            }
        )
        species_cols = [col for col in df.columns if col.startswith("k__")]

        heatmap = compute_heatmap(df, species_cols)

        self.assertEqual(sorted(heatmap["colOrder"]), list(range(len(heatmap["stats"]))))
        self.assertNotIn("nClusters", heatmap)
        self.assertNotIn("clusterLabels", heatmap)
        self.assertNotIn("clusterOrder", heatmap)
        self.assertNotIn("rawMatrix", heatmap)

    def test_heatmap_caches_joint_row_and_column_dendrograms(self) -> None:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "AD", "AD", "NC", "NC", "NC", "NC"],
                "Sample": ["AD1", "AD2", "AD3", "AD4", "NC1", "NC2", "NC3", "NC4"],
                "k__Bacteria|p__A|c__A|g__A|s__A": [50, 52, 51, 53, 1, 1, 1, 1],
                "k__Bacteria|p__B|c__B|g__B|s__B": [48, 50, 49, 51, 1, 1, 1, 1],
                "k__Bacteria|p__C|c__C|g__C|s__C": [1, 1, 1, 1, 60, 62, 61, 63],
                "k__Bacteria|p__D|c__D|g__D|s__D": [1, 1, 1, 1, 58, 60, 59, 61],
            }
        )
        species_cols = [col for col in df.columns if col.startswith("k__")]

        heatmap = compute_heatmap(df, species_cols)

        sample_count = len(heatmap["adLabels"]) + len(heatmap["ncLabels"])
        feature_count = len(heatmap["stats"])
        self.assertEqual(sorted(heatmap["combinedRowOrder"]), list(range(sample_count)))
        self.assertEqual(heatmap["dendrograms"]["metric"], "euclidean")
        self.assertEqual(heatmap["dendrograms"]["linkage"], "average")
        self.assertEqual(len(heatmap["dendrograms"]["rows"]["merges"]), sample_count - 1)
        self.assertEqual(len(heatmap["dendrograms"]["columns"]["merges"]), feature_count - 1)
        self.assertEqual(sorted(heatmap["colOrder"]), list(range(feature_count)))

    def test_hierarchical_cluster_degrades_for_small_or_identical_matrices(self) -> None:
        single = _hierarchical_cluster(np.array([[1.0, 2.0]]))
        pair = _hierarchical_cluster(np.array([[0.0, 0.0], [2.0, 2.0]]))
        identical = _hierarchical_cluster(np.ones((3, 2)))

        self.assertEqual(single, {"order": [0], "merges": []})
        self.assertEqual(sorted(pair["order"]), [0, 1])
        self.assertEqual(len(pair["merges"]), 1)
        self.assertEqual(identical, {"order": [0, 1, 2], "merges": []})


class BoxplotPrecomputeTests(unittest.TestCase):
    def test_box_whiskers_use_nearest_real_sample_values(self) -> None:
        box = _box_values(pd.Series([1, 2, 3, 4, 100]).to_numpy(dtype=float))

        self.assertEqual(box, [1.0, 2.0, 3.0, 4.0, 4.0])

    def test_boxplot_payload_includes_raw_and_log_outliers(self) -> None:
        species = "k__Bacteria|p__A|c__A|g__A|s__Target"
        df = pd.DataFrame(
            {
                "Group": ["AD"] * 6 + ["NC"] * 6,
                "Sample": [f"AD{i}" for i in range(6)] + [f"NC{i}" for i in range(6)],
                species: [0, 10, 11, 12, 13, 100, 1, 1, 1, 1, 1, 1],
            }
        )

        payload = compute_boxplot(df, [species], top_n=1)
        item = payload["items"][0]

        self.assertIn("adBox", item)
        self.assertIn("ncBox", item)
        self.assertEqual(item["adBox"], [10.0, 10.25, 11.5, 12.75, 13.0])
        self.assertEqual(item["adOutliers"], [0.0, 100.0])
        self.assertEqual(item["ncOutliers"], [])

        self.assertIn("adLogBox", item)
        self.assertIn("ncLogBox", item)
        self.assertEqual(item["adLogOutliers"][0], 0.0)
        self.assertAlmostEqual(item["adLogOutliers"][1], 2.0043213737826426)
        self.assertEqual(item["ncLogOutliers"], [])
        self.assertEqual(item["ncLogBox"], [0.3010299956639812] * 5)


class DetectionHeatmapPrecomputeTests(unittest.TestCase):
    def test_detection_heatmap_counts_detected_samples_and_rates(self) -> None:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "NC", "NC"],
                "Sample": ["AD1", "AD2", "NC1", "NC2"],
                "K00001": [10, 0, 1, 0],
                "K00002": [5, 5, 5, 5],
                "K00003": [0, 0, 0, 0],
            }
        )
        df.attrs["feature_kind"] = "ko"
        df.attrs["feature_label"] = "KO"

        payload = compute_detection_heatmap(df, ["K00001", "K00002", "K00003"])

        self.assertEqual(payload["featureLabel"], "KO")
        self.assertEqual(payload["detectionRule"], "abundance > 0")
        self.assertEqual(payload["rowLabels"], ["AD", "NC"])
        self.assertEqual(payload["colLabels"], ["K00002", "K00001"])
        self.assertEqual(payload["matrix"], [[1.0, 0.5], [1.0, 0.5]])
        self.assertEqual(
            payload["items"][1],
            {
                "koId": "K00001",
                "koName": "K00001",
                "adDetectedSamples": 1,
                "adDetectionRate": 0.5,
                "ncDetectedSamples": 1,
                "ncDetectionRate": 0.5,
                "rateGap": 0.0,
                "overallDetectedSamples": 2,
                "overallDetectionRate": 0.5,
            },
        )

    def test_detection_heatmap_sorts_by_absolute_rate_gap_first(self) -> None:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "AD", "AD", "NC", "NC", "NC", "NC"],
                "Sample": ["AD1", "AD2", "AD3", "AD4", "NC1", "NC2", "NC3", "NC4"],
                "K00001": [1, 1, 0, 0, 0, 0, 0, 0],
                "K00002": [1, 1, 1, 1, 1, 1, 1, 0],
                "K00003": [1, 0, 0, 0, 1, 0, 0, 0],
            }
        )
        df.attrs["feature_kind"] = "ko"
        df.attrs["feature_label"] = "KO"

        payload = compute_detection_heatmap(df, ["K00001", "K00002", "K00003"])

        self.assertEqual(payload["colLabels"], ["K00001", "K00002", "K00003"])
        self.assertAlmostEqual(abs(payload["items"][0]["rateGap"]), 0.5)
        self.assertAlmostEqual(abs(payload["items"][1]["rateGap"]), 0.25)
        self.assertAlmostEqual(payload["items"][2]["rateGap"], 0.0)

    def test_detection_heatmap_tie_breaks_by_max_rate_overall_rate_then_ko_id(self) -> None:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "NC", "NC", "NC", "NC"],
                "Sample": ["AD1", "AD2", "NC1", "NC2", "NC3", "NC4"],
                "K00001": [1, 1, 1, 1, 0, 0],
                "K00002": [1, 0, 1, 1, 1, 1],
                "K00003": [0, 1, 1, 1, 1, 1],
            }
        )
        df.attrs["feature_kind"] = "ko"
        df.attrs["feature_label"] = "KO"

        payload = compute_detection_heatmap(df, ["K00001", "K00002", "K00003"])

        self.assertEqual(payload["colLabels"], ["K00002", "K00003", "K00001"])
        self.assertAlmostEqual(abs(payload["items"][0]["rateGap"]), 0.5)
        self.assertAlmostEqual(payload["items"][0]["overallDetectionRate"], 5 / 6)
        self.assertEqual(payload["items"][0]["koId"], "K00002")

    def test_precompute_all_only_generates_ko_specific_artifacts_for_ko(self) -> None:
        with TemporaryDirectory() as tmpdir:
            ko_path = Path(tmpdir) / "ko.csv"
            ko_path.write_text(
                "\n".join(
                    [
                        "sample_id,label,K00001,K00002",
                        "AD001,AD,1,0",
                        "AD002,AD,1,1",
                        "NC001,NC,0,1",
                        "NC002,NC,0,0",
                    ]
                ),
                encoding="utf-8",
            )
            taxonomy_path = Path(tmpdir) / "taxonomy.csv"
            taxonomy_path.write_text(
                "\n".join(
                    [
                        "sample_id,Group,k__Bacteria|p__A|c__A|g__A|s__A",
                        "AD001,AD,1",
                        "NC001,NC,0",
                    ]
                ),
                encoding="utf-8",
            )

            _, ko_artifacts, _ = precompute_all(
                ko_path,
                "ad-ko-abundance",
                "AD KO Abundance",
                "2026-06-02T00:00:00+00:00",
            )
            _, taxonomy_artifacts, _ = precompute_all(
                taxonomy_path,
                "ad-species",
                "AD Species",
                "2026-06-02T00:00:00+00:00",
            )

        self.assertIn("detection", ko_artifacts)
        self.assertIn("lda", ko_artifacts)
        self.assertNotIn("heatmap", ko_artifacts)
        self.assertNotIn("boxplot", ko_artifacts)
        self.assertNotIn("sunburst", ko_artifacts)
        self.assertNotIn("pca", ko_artifacts)
        self.assertNotIn("pcoa", ko_artifacts)
        self.assertEqual(set(ko_artifacts), {"summary", "species", "phylum", "detection", "lda"})
        self.assertIn("boxplot", taxonomy_artifacts)
        self.assertIn("sunburst", taxonomy_artifacts)
        self.assertIn("pca", taxonomy_artifacts)
        self.assertIn("pcoa", taxonomy_artifacts)
        self.assertIn("heatmap", taxonomy_artifacts)
        self.assertNotIn("detection", taxonomy_artifacts)
        self.assertNotIn("lda", taxonomy_artifacts)


class KoLdaPrecomputeTests(unittest.TestCase):
    def _lda_df(self) -> pd.DataFrame:
        df = pd.DataFrame(
            {
                "Group": ["AD", "AD", "AD", "AD", "NC", "NC", "NC", "NC"],
                "Sample": ["AD1", "AD2", "AD3", "AD4", "NC1", "NC2", "NC3", "NC4"],
                "K00001": [100, 110, 120, 130, 1, 2, 3, 4],
                "K00002": [10, 11, 12, 13, 1, 2, 3, 4],
                "K00003": [1, 2, 3, 4, 100, 110, 120, 130],
                "K00004": [5, 5, 5, 5, 5, 5, 5, 5],
            }
        )
        df.attrs["feature_kind"] = "ko"
        df.attrs["feature_label"] = "KO"
        return df

    def test_ko_lda_filters_by_p_value_and_reports_effect_fields(self) -> None:
        p_values = [
            SimpleNamespace(pvalue=0.01),
            SimpleNamespace(pvalue=0.02),
            SimpleNamespace(pvalue=0.001),
            SimpleNamespace(pvalue=0.5),
        ]

        with patch("app.compute.precompute.mannwhitneyu", side_effect=p_values), patch(
            "app.compute.precompute._univariate_lda_score",
            side_effect=[4.0, 3.0, 5.0, 0.0],
        ):
            payload = compute_ko_lda(self._lda_df(), ["K00001", "K00002", "K00003", "K00004"], top_n=4)

        self.assertEqual(payload["featureLabel"], "KO")
        self.assertEqual(payload["method"], "Mann-Whitney U + univariate LDA on log10(abundance + 1)")
        self.assertEqual(
            payload["filter"],
            {
                "pValueMax": 0.05,
                "topN": 4,
                "selectionMode": "balanced_significant_by_group",
                "perGroupTopN": 2,
            },
        )
        self.assertEqual(
            payload["summary"],
            {
                "significantCount": 3,
                "adEnrichedCount": 2,
                "ncEnrichedCount": 1,
                "displayedCount": 3,
                "adDisplayedCount": 2,
                "ncDisplayedCount": 1,
            },
        )
        self.assertEqual([item["koId"] for item in payload["items"]], ["K00001", "K00002", "K00003"])
        self.assertNotIn("K00004", [item["koId"] for item in payload["items"]])

        ad_item = payload["items"][0]
        self.assertEqual(ad_item["koName"], "K00001")
        self.assertEqual(ad_item["enrichedGroup"], "AD")
        self.assertGreater(ad_item["ldaScore"], 0)
        self.assertEqual(ad_item["pValue"], 0.01)
        self.assertGreater(ad_item["log2FC"], 0)
        self.assertGreater(ad_item["meanAD"], ad_item["meanNC"])

        nc_item = payload["items"][2]
        self.assertEqual(nc_item["koName"], "K00003")
        self.assertEqual(nc_item["enrichedGroup"], "NC")
        self.assertGreater(nc_item["ldaScore"], 0)
        self.assertEqual(nc_item["pValue"], 0.001)
        self.assertLess(nc_item["log2FC"], 0)
        self.assertLess(nc_item["meanAD"], nc_item["meanNC"])

    def test_ko_lda_tie_breaks_by_ko_id_after_score_and_p_value(self) -> None:
        p_values = [
            SimpleNamespace(pvalue=0.01),
            SimpleNamespace(pvalue=0.02),
            SimpleNamespace(pvalue=0.01),
            SimpleNamespace(pvalue=0.5),
        ]

        with patch("app.compute.precompute.mannwhitneyu", side_effect=p_values), patch(
            "app.compute.precompute._univariate_lda_score",
            side_effect=[4.0, 4.0, 4.0, 0.0],
        ):
            payload = compute_ko_lda(self._lda_df(), ["K00001", "K00002", "K00003", "K00004"], top_n=4)

        self.assertEqual([item["koId"] for item in payload["items"]], ["K00001", "K00002", "K00003"])

    def test_ko_lda_does_not_backfill_when_one_group_has_fewer_significant_items(self) -> None:
        p_values = [
            SimpleNamespace(pvalue=0.01),
            SimpleNamespace(pvalue=0.001),
            SimpleNamespace(pvalue=0.002),
            SimpleNamespace(pvalue=0.003),
        ]

        with patch("app.compute.precompute.mannwhitneyu", side_effect=p_values), patch(
            "app.compute.precompute._univariate_lda_score",
            side_effect=[5.0, 4.0, 3.0, 2.0],
        ):
            payload = compute_ko_lda(self._lda_df(), ["K00001", "K00003", "K00003", "K00003"], top_n=4)

        self.assertEqual([item["enrichedGroup"] for item in payload["items"]], ["AD", "NC", "NC"])
        self.assertEqual(payload["summary"]["displayedCount"], 3)
        self.assertEqual(payload["summary"]["adDisplayedCount"], 1)
        self.assertEqual(payload["summary"]["ncDisplayedCount"], 2)


if __name__ == "__main__":
    unittest.main()
