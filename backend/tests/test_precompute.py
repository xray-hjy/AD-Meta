from __future__ import annotations

import copy
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pandas as pd

from app.compute.charts.taxonomy.projections import (
    SANKEY_COLUMN_BUDGETS,
    compute_taxonomy_sankey_projection,
)
from app.compute.precompute import (
    _box_values,
    _hierarchical_cluster,
    compute_boxplot,
    compute_detection_heatmap,
    compute_heatmap,
    compute_ko_lda,
    compute_sunburst,
    precompute_all,
    prepare_dataframe,
)


class ComputeModuleLayoutTests(unittest.TestCase):
    def test_chart_functions_are_available_from_split_modules_and_precompute(self) -> None:
        from app.compute.charts.boxplot import compute_boxplot as split_compute_boxplot
        from app.compute.charts.detection import compute_detection_heatmap as split_compute_detection_heatmap
        from app.compute.charts.heatmap import compute_heatmap as split_compute_heatmap
        from app.compute.charts.lda import compute_ko_lda as split_compute_ko_lda
        from app.compute.charts.ordination import compute_pca as split_compute_pca
        from app.compute.charts.ordination import compute_pcoa as split_compute_pcoa
        from app.compute.charts.phylum import compute_phylum as split_compute_phylum
        from app.compute.charts.species import compute_species as split_compute_species
        from app.compute.charts.summary import compute_summary as split_compute_summary
        from app.compute.charts.sunburst import compute_sunburst as split_compute_sunburst
        from app.compute.charts.taxonomy import compute_taxonomy_hierarchy as split_compute_taxonomy_hierarchy
        from app.compute.charts.taxonomy import (
            compute_taxonomy_sankey_projection as split_compute_taxonomy_sankey_projection,
        )
        from app.compute.precompute import (
            compute_pca,
            compute_pcoa,
            compute_phylum,
            compute_species,
            compute_summary,
            compute_taxonomy_hierarchy,
            compute_taxonomy_sankey_projection,
        )

        self.assertIs(compute_boxplot, split_compute_boxplot)
        self.assertIs(compute_detection_heatmap, split_compute_detection_heatmap)
        self.assertIs(compute_heatmap, split_compute_heatmap)
        self.assertIs(compute_ko_lda, split_compute_ko_lda)
        self.assertIs(compute_phylum, split_compute_phylum)
        self.assertIs(compute_species, split_compute_species)
        self.assertIs(compute_sunburst, split_compute_sunburst)
        self.assertIs(compute_taxonomy_hierarchy, split_compute_taxonomy_hierarchy)
        self.assertIs(compute_taxonomy_sankey_projection, split_compute_taxonomy_sankey_projection)
        self.assertIs(compute_pca, split_compute_pca)
        self.assertIs(compute_pcoa, split_compute_pcoa)
        self.assertIs(compute_summary, split_compute_summary)


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

    def test_rejects_binary_label_group_column(self) -> None:
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

            with self.assertRaisesRegex(ValueError, "Only AD and NC"):
                prepare_dataframe(path)

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
            for index in range(1, 15)
        ]
        with TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "species.csv"
            path.write_text(
                "\n".join(
                    [
                        ",".join(["sample_id", "Group", *class_features]),
                        "AD001,AD,100,90,80,70,60,50,40,30,20,10,9,8,7,6",
                        "NC001,NC,0,0,0,0,0,0,0,0,0,0,0,0,0,0",
                    ]
                ),
                encoding="utf-8",
            )

            df, feature_cols, _ = prepare_dataframe(path)
            sunburst = compute_sunburst(df, feature_cols)

        phylum = sunburst[0]
        class_children = phylum["children"]
        class_names = [child["name"] for child in class_children]

        self.assertLessEqual(len(class_children), 13)
        self.assertEqual(class_names[:12], [f"Class_{index}" for index in range(1, 13)])
        self.assertIn("Other classes", class_names)
        other = next(child for child in class_children if child["name"] == "Other classes")
        self.assertEqual(other["mergedCount"], 2)
        self.assertAlmostEqual(sum(float(child["value"]) for child in class_children), float(phylum["value"]))


class TaxonomySankeyProjectionTests(unittest.TestCase):
    def _dense_tree(self) -> list[dict]:
        phyla = []
        for phylum_index in range(15):
            classes = []
            for class_index in range(6):
                genera = []
                for genus_index in range(5):
                    species = []
                    for species_index in range(4):
                        value = float(
                            10_000
                            - phylum_index * 300
                            - class_index * 40
                            - genus_index * 6
                            - species_index
                        )
                        species.append(
                            {
                                "name": f"Species_{phylum_index}_{class_index}_{genus_index}_{species_index}",
                                "rank": "species",
                                "value": value,
                            }
                        )
                    species.append(
                        {
                            "name": "Other species",
                            "rank": "species",
                            "value": 3.0,
                            "mergedCount": 3,
                        }
                    )
                    genus_value = sum(item["value"] for item in species)
                    genera.append(
                        {
                            "name": f"Genus_{phylum_index}_{class_index}_{genus_index}",
                            "rank": "genus",
                            "value": genus_value,
                            "children": species,
                        }
                    )
                class_value = sum(item["value"] for item in genera)
                classes.append(
                    {
                        "name": f"Class_{phylum_index}_{class_index}",
                        "rank": "class",
                        "value": class_value,
                        "children": genera,
                    }
                )
            phylum_value = sum(item["value"] for item in classes)
            phyla.append(
                {
                    "name": f"Phylum_{phylum_index}",
                    "rank": "phylum",
                    "value": phylum_value,
                    "children": classes,
                }
            )
        return phyla

    def test_bounds_dense_projection_and_preserves_flow_totals(self) -> None:
        tree = self._dense_tree()
        original = copy.deepcopy(tree)

        payload = compute_taxonomy_sankey_projection(tree)
        repeated = compute_taxonomy_sankey_projection(tree)

        self.assertEqual(tree, original)
        self.assertEqual(payload, repeated)
        self.assertLessEqual(len(payload["nodes"]), sum(SANKEY_COLUMN_BUDGETS.values()))

        depth_counts = {
            depth: sum(1 for node in payload["nodes"] if node["depth"] == depth)
            for depth in SANKEY_COLUMN_BUDGETS
        }
        for depth, budget in SANKEY_COLUMN_BUDGETS.items():
            self.assertLessEqual(depth_counts[depth], budget)

        node_values = {node["name"]: float(node["value"]) for node in payload["nodes"]}
        outgoing: dict[str, float] = {}
        child_labels: dict[str, list[str]] = {}
        node_labels = {node["name"]: node["label"] for node in payload["nodes"]}
        for link in payload["links"]:
            outgoing[link["source"]] = outgoing.get(link["source"], 0.0) + float(link["value"])
            child_labels.setdefault(link["source"], []).append(node_labels[link["target"]])

        for node_id, value in outgoing.items():
            self.assertAlmostEqual(value, node_values[node_id])
        for labels in child_labels.values():
            self.assertLessEqual(sum(label.startswith("Other ") for label in labels), 1)

        root_total = sum(node["value"] for node in payload["nodes"] if node["depth"] == 0)
        self.assertAlmostEqual(root_total, sum(item["value"] for item in tree))
        aggregates = [node for node in payload["nodes"] if node["label"].startswith("Other ")]
        self.assertTrue(aggregates)
        self.assertTrue(all(node["mergedCount"] > 0 for node in aggregates))


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

        with patch("app.compute.charts.heatmap.mannwhitneyu", side_effect=p_values):
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
        self.assertEqual(heatmap["filter"]["significantCount"], feature_count)
        self.assertEqual(heatmap["filter"]["displayedCount"], feature_count)

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
        self.assertEqual(
            item["adOutlierPoints"],
            [{"sample": "AD0", "value": 0.0}, {"sample": "AD5", "value": 100.0}],
        )
        self.assertEqual(item["ncOutlierPoints"], [])

        self.assertIn("adLogBox", item)
        self.assertIn("ncLogBox", item)
        self.assertEqual(item["adLogOutliers"][0], 0.0)
        self.assertAlmostEqual(item["adLogOutliers"][1], 2.0043213737826426)
        self.assertEqual(item["ncLogOutliers"], [])
        self.assertEqual(item["adLogOutlierPoints"][0], {"sample": "AD0", "value": 0.0})
        self.assertEqual(item["adLogOutlierPoints"][1]["sample"], "AD5")
        self.assertAlmostEqual(item["adLogOutlierPoints"][1]["value"], 2.0043213737826426)
        self.assertEqual(item["ncLogOutlierPoints"], [])
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
        self.assertIn("differential_ko", ko_artifacts)
        self.assertIn("lda", ko_artifacts)
        self.assertNotIn("heatmap", ko_artifacts)
        self.assertNotIn("boxplot", ko_artifacts)
        self.assertNotIn("sunburst", ko_artifacts)
        self.assertNotIn("pca", ko_artifacts)
        self.assertNotIn("pcoa", ko_artifacts)
        self.assertEqual(
            set(ko_artifacts),
            {"summary", "species", "phylum", "detection", "differential_ko", "lda"},
        )
        self.assertIn("boxplot", taxonomy_artifacts)
        self.assertIn("taxonomy", taxonomy_artifacts)
        self.assertIn("taxonomy_sankey", taxonomy_artifacts)
        self.assertIn("sunburst", taxonomy_artifacts)
        self.assertIn("pca", taxonomy_artifacts)
        self.assertIn("pcoa", taxonomy_artifacts)
        self.assertIn("heatmap", taxonomy_artifacts)
        self.assertNotIn("detection", taxonomy_artifacts)
        self.assertNotIn("lda", taxonomy_artifacts)
        self.assertEqual(taxonomy_artifacts["taxonomy_sankey"]["kind"], "taxonomy_sankey")
        self.assertGreater(len(taxonomy_artifacts["taxonomy_sankey"]["nodes"]), 0)
        self.assertGreater(len(taxonomy_artifacts["taxonomy_sankey"]["links"]), 0)
        self.assertIn("height", taxonomy_artifacts["taxonomy_sankey"]["layout"])


class KoDifferentialPrecomputeTests(unittest.TestCase):
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

    def test_ko_differential_filters_by_q_value_and_reports_effect_fields(self) -> None:
        p_values = [
            SimpleNamespace(pvalue=0.01, statistic=16),
            SimpleNamespace(pvalue=0.02, statistic=16),
            SimpleNamespace(pvalue=0.001, statistic=0),
            SimpleNamespace(pvalue=0.5, statistic=8),
        ]

        with patch("app.compute.charts.lda.mannwhitneyu", side_effect=p_values):
            payload = compute_ko_lda(self._lda_df(), ["K00001", "K00002", "K00003", "K00004"], top_n=4)

        self.assertEqual(payload["featureLabel"], "KO")
        self.assertEqual(payload["method"], "Mann-Whitney U with Benjamini-Hochberg FDR")
        self.assertEqual(payload["inferenceLevel"], "exploratory_fdr")
        self.assertEqual(payload["filter"]["qValueMax"], 0.05)
        self.assertEqual(payload["filter"]["multipleTesting"], "Benjamini-Hochberg")
        self.assertEqual(payload["filter"]["selectionMode"], "balanced_fdr_significant_by_group")
        self.assertEqual(
            payload["summary"],
            {
                "testedCount": 4,
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
        self.assertEqual(ad_item["effectMetric"], "rank_biserial_correlation")
        self.assertGreater(ad_item["effectSize"], 0)
        self.assertEqual(ad_item["pValue"], 0.01)
        self.assertLess(ad_item["qValue"], 0.05)
        self.assertGreater(ad_item["log2FC"], 0)
        self.assertGreater(ad_item["meanAD"], ad_item["meanNC"])

        nc_item = payload["items"][2]
        self.assertEqual(nc_item["koName"], "K00003")
        self.assertEqual(nc_item["enrichedGroup"], "NC")
        self.assertLess(nc_item["effectSize"], 0)
        self.assertEqual(nc_item["pValue"], 0.001)
        self.assertLess(nc_item["log2FC"], 0)
        self.assertLess(nc_item["meanAD"], nc_item["meanNC"])

    def test_ko_differential_tie_breaks_by_ko_id_after_effect_and_q_value(self) -> None:
        p_values = [
            SimpleNamespace(pvalue=0.01, statistic=16),
            SimpleNamespace(pvalue=0.02, statistic=16),
            SimpleNamespace(pvalue=0.01, statistic=0),
            SimpleNamespace(pvalue=0.5, statistic=8),
        ]

        with patch("app.compute.charts.lda.mannwhitneyu", side_effect=p_values):
            payload = compute_ko_lda(self._lda_df(), ["K00001", "K00002", "K00003", "K00004"], top_n=4)

        self.assertEqual([item["koId"] for item in payload["items"]], ["K00001", "K00002", "K00003"])

    def test_ko_differential_does_not_backfill_when_one_group_has_fewer_significant_items(self) -> None:
        p_values = [
            SimpleNamespace(pvalue=0.01, statistic=16),
            SimpleNamespace(pvalue=0.001, statistic=0),
            SimpleNamespace(pvalue=0.002, statistic=0),
            SimpleNamespace(pvalue=0.003, statistic=0),
        ]

        with patch("app.compute.charts.lda.mannwhitneyu", side_effect=p_values):
            payload = compute_ko_lda(self._lda_df(), ["K00001", "K00003", "K00003", "K00003"], top_n=4)

        self.assertEqual([item["enrichedGroup"] for item in payload["items"]], ["AD", "NC", "NC"])
        self.assertEqual(payload["summary"]["displayedCount"], 3)
        self.assertEqual(payload["summary"]["adDisplayedCount"], 1)
        self.assertEqual(payload["summary"]["ncDisplayedCount"], 2)


if __name__ == "__main__":
    unittest.main()
