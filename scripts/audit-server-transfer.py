"""Audit delivered data without executing scripts; optionally copy unique inputs.

Archive texts are evidence, never instructions. Original files are preserved.
Requires openpyxl for comparing the current species workbook.
"""
import argparse
from array import array
import collections
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import sys

import openpyxl


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(2**20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rows(path, delimiter="\t"):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream, delimiter=delimiter))


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def target_path(relative):
    p = Path(relative)
    name = p.name
    parts = p.parts
    if "kraken2_temp" in parts or "raw_report_example" in parts or re.match(r"CRR\d+-(kraken2|bracken)", name):
        return f"01_species/raw_reports/{name}"
    if name.startswith("merged-"):
        return f"01_species/merged/{name}"
    if name == "kraken_taxid_name_mapping.tsv":
        return f"01_species/mappings/{name}"
    if name.startswith("AD_dRep") and name.endswith("tree"):
        return f"03_trees/gtdb_classification/{name}"
    if name.startswith("AD_dRep"):
        return f"02_mag/taxonomy/{name}"
    if "abundance" in parts:
        remainder = parts[parts.index("abundance") + 1:]
        return "02_mag/abundance/" + "/".join(remainder)
    if name.startswith("sample_mag"):
        return f"02_mag/abundance/{name}"
    if name == "quality_report.tsv":
        return f"02_mag/quality/{name}"
    if "dereplication" in parts or name in {"Cdb.csv", "Widb.csv", "Ndb.csv", "drep_genomeInfo.csv", "representative_mag_files.txt"}:
        return f"02_mag/dereplication/{name}"
    if "figures" in parts:
        return f"02_mag/dereplication/figures/{name}"
    if name in {"inspect.txt", "ktaxonomy.tsv", "pluspf.md5"}:
        return f"04_reference/kraken2_pluspf_20250714/{name}"
    if name in {"metadata.txt", "gtdbtk_r232_metadata.txt"}:
        return f"04_reference/gtdb_r232/{name}"
    if re.match(r"(ar53|bac120)_.*r232", name) or name == "gtdb_taxonomy.tsv":
        return f"04_reference/gtdb_r232/{name}"
    if name == "bacteria_taxonomy.tsv":
        return f"04_reference/other/{name}"
    if name.startswith("config_"):
        return f"05_pipeline_evidence/configs/{name}"
    if name.endswith((".sh", ".snakefile")):
        return f"05_pipeline_evidence/server_scripts/{name}"
    if name in {"gtdbtk.json"} or name.endswith(".log"):
        return f"05_pipeline_evidence/logs/{name}"
    if name.endswith((".ps1", ".py")) or name.endswith("_qa.txt"):
        return f"05_pipeline_evidence/local_processing/{name}"
    if name.startswith("species_taxonomy_crosswalk") or name == "gtdb_reference_ncbi_taxid_mapping.tsv":
        return f"06_taxonomy_crosswalk/{name}"
    # Retain full relative path for otherwise unknown files, avoiding guessed roles.
    return "90_source_documentation/" + relative


def priority(relative):
    return (0 if relative.startswith("02_curated/") else
            1 if relative.startswith("未整理入档的文件/abundance/") else
            2 if relative.startswith("未整理入档的文件/") else
            3 if relative.startswith("01_inbox/") else 4, relative)


def coverm_consistency(directory):
    metrics = {"mean": "sample_mag_mean_coverage.tsv", "relative_abundance": "sample_mag_relative_abundance.tsv",
               "covered_fraction": "sample_mag_covered_fraction.tsv", "variance": "sample_mag_variance.tsv",
               "count": "sample_mag_read_count.tsv", "reads_per_base": "sample_mag_reads_per_base.tsv"}
    wide = {}
    for key, filename in metrics.items():
        with (directory / filename).open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, delimiter="\t")
            header = next(reader)
            wide[key] = ({mid: i for i, mid in enumerate(header[1:])},
                         {r[0]: array("d", map(float, r[1:])) for r in reader})
    seen, mismatches, nonfinite = set(), collections.Counter(), 0
    with (directory / "sample_mag_all_metrics_long.tsv").open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            pair = (row["Sample"], row["MAG"])
            if pair in seen:
                raise ValueError(f"Duplicate sample/MAG pair: {pair}")
            seen.add(pair)
            for key, (columns, values) in wide.items():
                x, y = float(row[key]), values[pair[0]][columns[pair[1]]]
                nonfinite += int(not math.isfinite(x) or not math.isfinite(y))
                if not math.isclose(x, y, rel_tol=1e-7, abs_tol=1e-8):
                    mismatches[key] += 1
    return {"unique_sample_mag_pairs": len(seen), "metric_value_mismatches": dict(mismatches),
            "nonfinite_values": nonfinite, "metrics_compared": list(metrics)}


def inspect(source, root):
    unfiled = source / "未整理入档的文件"
    mag = root / "ADMetaData/development_input/mag_v3"
    cohort = {r["sample_id"] for r in rows(mag / "metadata/metadata_NC_AD.csv", ",")}
    q = rows(unfiled / "quality_report.tsv")
    passed = {r["Name"] for r in q if float(r["Completeness"]) >= 50 and float(r["Contamination"]) <= 10}
    gi = rows(unfiled / "drep_genomeInfo.csv", ",")
    cdb = rows(unfiled / "Cdb.csv", ",")
    widb = rows(unfiled / "Widb.csv", ",")
    members = {Path(r["genome"]).stem for r in cdb}
    reps = {Path(r["genome"]).stem for r in widb}
    summaries = rows(unfiled / "AD_dRep.bac120.summary.tsv") + rows(unfiled / "AD_dRep.ar53.summary.tsv")
    summary_ids = {r["user_genome"] for r in summaries}
    platform_tax = {r["MAG"]: r for r in rows(mag / "annotations/mag_taxonomy.tsv")}
    platform_quality = {r["MAG"]: r for r in rows(mag / "quality/mag_quality.tsv")}
    quality_by_id = {r["Name"]: r for r in q}
    levels = ["domain", "phylum", "class", "order", "family", "genus", "species"]
    taxonomy_conflicts = []
    for row in summaries:
        values = [s.split("__", 1)[1] for s in row["classification"].split(";")]
        if row["user_genome"] not in platform_tax or values != [platform_tax[row["user_genome"]][k] for k in levels]:
            taxonomy_conflicts.append(row["user_genome"])
    quality_conflicts = []
    for mid, row in platform_quality.items():
        original = quality_by_id.get(mid)
        if original is None or any(abs(float(row[field]) - float(original[old])) > 1e-8 for field, old in
                                   [("completeness_percent", "Completeness"), ("contamination_percent", "Contamination"),
                                    ("genome_size_bp", "Genome_Size"), ("contig_n50_bp", "Contig_N50")]):
            quality_conflicts.append(mid)
    sample_manifest = rows(unfiled / "abundance/sample_manifest.tsv")
    check = {
        "quality_rows": len(q), "quality_pass_rows": len(passed), "drep_member_rows": len(cdb),
        "representative_rows": len(widb), "secondary_clusters": len({r["secondary_cluster"] for r in cdb}),
        "quality_pass_set_equals_drep_input": passed == {Path(r["genome"]).stem for r in gi},
        "drep_members_equal_quality_pass_set": members == passed,
        "gtdb_summary_counts": {"bacteria": len(rows(unfiled / "AD_dRep.bac120.summary.tsv")), "archaea": len(rows(unfiled / "AD_dRep.ar53.summary.tsv"))},
        "gtdb_summary_equals_representative_ids": summary_ids == reps,
        "coverm_sample_manifest_matches_current185": {r["Sample"] for r in sample_manifest} == cohort,
        "current_mag_taxonomy_conflicts": taxonomy_conflicts,
        "current_mag_quality_conflicts": quality_conflicts,
    }
    handoff = json.loads((mag / "provenance/mag_v3_manifest.json").read_text(encoding="utf-8"))
    all_paths = [p for p in source.rglob("*") if p.is_file()]
    for section in ["sourceInputs", "files"]:
        findings = []
        for entry in handoff[section]:
            filename = Path(entry.get("path", entry.get("name", ""))).name
            matching = [p.relative_to(source).as_posix() for p in all_paths
                        if p.name == filename and sha(p).lower() == entry["sha256"].lower()]
            findings.append({"handoff_entry": entry.get("path", entry.get("name")), "matching_server_files": matching})
        check[f"handoff_{section}_hash_matches"] = findings
    gt = json.loads((source / "02_curated/05_pipeline_evidence/logs/gtdbtk.json").read_text(encoding="utf-8"))
    check["gtdb_run"] = {"version": gt["version"], "database": gt["database_version"],
                         "command": gt["command_line"], "steps": [{k: s.get(k) for k in ["name", "status", "starts_at", "ends_at"]} for s in gt["steps"]]}
    reports = source / "01_inbox/kraken2_temp"
    check["species_report_sample_sets"] = {}
    for suffix in ["kraken2-report", "bracken-report", "bracken_new-report"]:
        ps = list(reports.glob(f"*-{suffix}.txt"))
        ids = {p.name.split("-")[0] for p in ps}
        check["species_report_sample_sets"][suffix] = {"count": len(ps), "matches_current185": ids == cohort}
    # Tree leaf coverage only: these are explicitly GTDB classify outputs, not IQ-TREE products.
    tree_checks = []
    for p in source.rglob("*.tree"):
        content = p.read_text(encoding="utf-8-sig")
        leaf_labels = set(re.findall(r"(?:\(|,)\s*(?:'([^']+)'|([^\s:,();]+))\s*(?=:|,|\))", content))
        labels = {a or b for a, b in leaf_labels}
        hits = reps & labels
        tree_checks.append({"source": p.relative_to(source).as_posix(), "type": "gtdb_classification_tree",
                            "leaf_count": len(labels), "current_mag_leaf_count": len(hits), "current_mag_ids": sorted(hits)})
    check["tree_files"] = tree_checks
    check["iqtree_result_files_found"] = [p.relative_to(source).as_posix() for p in all_paths
                                         if p.suffix in {".treefile", ".contree", ".iqtree", ".nwk", ".newick"}]
    check["metric_definitions_source_has_tabs"] = "\t" in (unfiled / "abundance/metric_definitions.tsv").read_text(encoding="utf-8-sig")
    md5_records = []
    reference = source / "02_curated/04_reference/kraken2_pluspf_20250714"
    for line in (reference / "pluspf.md5").read_text(encoding="utf-8-sig").splitlines():
        expected, name = line.split(maxsplit=1)
        if (reference / name).exists():
            actual = hashlib.md5((reference / name).read_bytes()).hexdigest()
            md5_records.append({"filename": name, "matches_supplied_md5": actual == expected})
    check["kraken_reference_md5_checks"] = md5_records
    check["coverm_long_vs_wide"] = coverm_consistency(unfiled / "abundance")
    return check, cohort


def species_comparison(source, root, cohort):
    base = source / "02_curated/01_taxonomy/reads_species"
    data = {}
    for mode, filename in [("counts", "merged-bracken_new-report.txt"), ("percent", "merged-bracken_new-report_rel.txt"),
                           ("kraken", "merged-kraken2-report.txt")]:
        with (base / filename).open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, delimiter="\t")
            header = next(reader)
            sample_columns = {s: i for i, s in enumerate(header[1:])}
            species = collections.defaultdict(list)
            for row in reader:
                final = row[0].split("|")[-1]
                if final.startswith("s__"):
                    key = final[3:].replace(" ", "_")
                    species[key].append((row[0], array("d", map(float, row[1:]))))
            data[mode] = (sample_columns, species)
    book = openpyxl.load_workbook(root / "backend/storage/raw/ad-nc-species/raw.xlsx", read_only=True, data_only=True)
    iterator = book.active.iter_rows(values_only=True)
    header = next(iterator)
    details = []
    pairs = []
    for i, feature in enumerate(header[3:], 3):
        key = str(feature).split("|")[-1]
        key = key[3:].replace(" ", "_") if key.startswith("s__") else key
        candidates = data["counts"][1].get(key, [])
        detail = {"source_column_1based": i + 1, "feature": feature, "species_name_key": key,
                  "server_match_count": len(candidates), "values_compared": 0,
                  "count_mismatches": 0, "percent_mismatches": 0,
                  "kraken_values_compared": 0, "kraken_count_mismatches": 0, "examples": []}
        details.append(detail)
        if len(candidates) == 1 and len(data["percent"][1].get(key, [])) == 1:
            kraken_candidates = data["kraken"][1].get(key, [])
            kraken = kraken_candidates[0][1] if len(kraken_candidates) == 1 else None
            pairs.append((i, detail, candidates[0][1], data["percent"][1][key][0][1], kraken))
    sample_ids = []
    for row in iterator:
        sid = str(row[0])
        if sid not in cohort:
            continue
        sample_ids.append(sid)
        ci, pi = data["counts"][0][sid], data["percent"][0][sid]
        for col, detail, counts, percentages, kraken in pairs:
            value = float(row[col] or 0)
            detail["values_compared"] += 1
            if abs(value - counts[ci]) > 1e-8:
                detail["count_mismatches"] += 1
                if len(detail["examples"]) < 2:
                    detail["examples"].append({"sample": sid, "workbook": value, "server_count": counts[ci], "server_percent": percentages[pi]})
            if abs(value - percentages[pi]) > 1e-8:
                detail["percent_mismatches"] += 1
            if kraken is not None:
                detail["kraken_values_compared"] += 1
                if abs(value - kraken[data["kraken"][0][sid]]) > 1e-8:
                    detail["kraken_count_mismatches"] += 1
    book.close()
    summary = {
        "identity_comparison_method": "unique terminal species name after space/underscore normalization; full taxonomy paths may differ",
        "workbook_feature_columns": len(header) - 3,
        "server_species_count": len(data["counts"][1]),
        "workbook_current_samples_compared": len(sample_ids), "sample_set_matches": set(sample_ids) == cohort,
        "uniquely_matched_feature_columns": len(pairs),
        "unmatched_feature_columns": sum(d["server_match_count"] == 0 for d in details),
        "ambiguous_feature_columns": sum(d["server_match_count"] > 1 for d in details),
        "total_compared_values": sum(d["values_compared"] for d in details),
        "count_mismatches": sum(d["count_mismatches"] for d in details),
        "percent_mismatches": sum(d["percent_mismatches"] for d in details),
        "kraken_values_compared": sum(d["kraken_values_compared"] for d in details),
        "kraken_count_mismatches": sum(d["kraken_count_mismatches"] for d in details),
        "all_workbook_columns_proven": len(pairs) == len(details) and all(d["count_mismatches"] == 0 for d in details),
    }
    return summary, details


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--copy-to", type=Path)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    if args.copy_to:
        destination = args.copy_to.resolve()
        if destination.exists() or destination == source or source in destination.parents or destination in source.parents:
            raise ValueError("Choose a new destination outside the source")
        plan = json.loads((args.audit / "copy_plan.json").read_text(encoding="utf-8"))
        destination.mkdir(parents=True)
        for index, entry in enumerate(plan, 1):
            original = source / entry["source_relative_path"]
            target = destination / entry["destination_relative_path"]
            if destination not in target.resolve().parents or source not in original.resolve().parents:
                raise ValueError("Path outside allowed source or destination")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, target)
            if sha(target) != entry["sha256"] or sha(original) != entry["sha256"]:
                raise ValueError(f"Copy or source differs: {original}")
            if index % 100 == 0:
                print(f"Copied and verified {index}/{len(plan)}", flush=True)
        for path in args.audit.iterdir():
            if path.is_file():
                shutil.copy2(path, destination / path.name)
        if (args.audit / "derived").exists():
            shutil.copytree(args.audit / "derived", destination / "derived")
        shutil.copy2(Path(__file__), destination / Path(__file__).name)
        with (args.audit / "source_inventory.tsv").open(encoding="utf-8-sig", newline="") as stream:
            for record in csv.DictReader(stream, delimiter="\t"):
                if record["copy_role"] == "duplicate_alias" and sha(source / record["source_relative_path"]) != record["sha256"]:
                    raise ValueError("Source duplicate changed during copy")
        dump(destination / "copy_verification.json", {"file_count": len(plan), "bytes": sum(r["bytes"] for r in plan),
                                                    "all_copies_sha256_verified": True, "original_sources_unchanged": True})
        print(f"Completed: {destination}")
        return
    if args.audit.exists():
        raise ValueError("Use a new audit directory")
    args.audit.mkdir(parents=True)
    hashes = collections.defaultdict(list)
    for path in sorted(source.rglob("*")):
        if path.is_file():
            hashes[sha(path)].append(path)
    inventory, plan = [], []
    targets = set()
    for digest, paths in sorted(hashes.items()):
        canonical = min(paths, key=lambda p: priority(p.relative_to(source).as_posix()))
        relative = canonical.relative_to(source).as_posix()
        dest = target_path(relative)
        if dest in targets:
            dest = str(Path(dest).with_name(canonical.stem + "__" + digest[:12] + canonical.suffix)).replace("\\", "/")
        if dest in targets:
            raise ValueError(f"Destination collision: {dest}")
        targets.add(dest)
        plan.append({"source_relative_path": relative, "destination_relative_path": dest, "sha256": digest,
                     "bytes": canonical.stat().st_size, "source_aliases": [p.relative_to(source).as_posix() for p in paths]})
        for path in paths:
            inventory.append({"source_relative_path": path.relative_to(source).as_posix(), "sha256": digest,
                              "bytes": path.stat().st_size, "copied_destination": dest,
                              "copy_role": "canonical" if path == canonical else "duplicate_alias"})
    dump(args.audit / "copy_plan.json", plan)
    with (args.audit / "source_inventory.tsv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(inventory[0]), delimiter="\t")
        writer.writeheader()
        writer.writerows(sorted(inventory, key=lambda r: r["source_relative_path"]))
    check, cohort = inspect(source, args.project_root)
    comparison, details = species_comparison(source, args.project_root, cohort)
    check["species_workbook_comparison"] = comparison
    check["source_file_count"] = len(inventory)
    check["unique_content_count"] = len(plan)
    check["unique_content_bytes"] = sum(r["bytes"] for r in plan)
    check["duplicate_copy_count"] = len(inventory) - len(plan)
    dump(args.audit / "audit_results.json", check)
    dump(args.audit / "species_feature_comparison.json", details)
    print(json.dumps({k: v for k, v in check.items() if k not in {"gtdb_run", "tree_files", "handoff_sourceInputs_hash_matches", "handoff_files_hash_matches"}}, ensure_ascii=False, indent=2))
    print("Tree coverage:", [(t["source"], t["leaf_count"], t["current_mag_leaf_count"]) for t in check["tree_files"]])


if __name__ == "__main__":
    main()
