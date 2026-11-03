"""Explicitly bind verified local inputs without certifying missing study archives.

Read-only by default. --apply preserves the old context and writes a new, scoped
context only after comparing the original MetaPhlAn input with the published DB.
No database writes, source edits, scientific reviews or participant IDs are made.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import tempfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from app.core.config import BACKEND_ROOT
from app.core.database import connect
from app.services import gmrepo_primary_evidence as evidence
from app.services.metaphlan_import import normalize_metaphlan


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def local_path(relative: str) -> Path:
    root = BACKEND_ROOT.parent.resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("Required local source is unavailable: " + relative)
    return path


def verify_inputs(dataset_slug: str) -> dict:
    previous_raw = evidence.CONTEXT_PATH.read_bytes()
    previous = json.loads(previous_raw)
    mapping = next(s for s in previous["sources"] if s["sourceId"] == "primary-sample-map")
    mapping_path = BACKEND_ROOT.parent / mapping["path"]
    if not mapping_path.exists():
        mapping_path = BACKEND_ROOT / "storage/provenance/CRA014435/2026-10-01/samples_current185.tsv"
    mapping_path = local_path(mapping_path.relative_to(BACKEND_ROOT.parent).as_posix())
    mapping_raw = mapping_path.read_bytes()
    if len(mapping_raw) != mapping["bytes"] or sha(mapping_raw) != mapping["sha256"]:
        raise ValueError("Sample map differs from the previously registered bytes; no rebind.")
    covariates = list(csv.DictReader(io.StringIO(mapping_raw.decode("utf-8-sig")), delimiter="\t"))
    ids = [r["run_accession"] for r in covariates]
    groups = dict(Counter(r["stage"] for r in covariates))
    if (len(ids) != len(set(ids)) or len(ids) != previous["sampleCount"]
            or sha("\n".join(sorted(ids)).encode()) != previous["sampleSetSha256"]
            or groups != previous["groupCounts"]):
        raise ValueError("Sample map does not match the registered scope; no rebind.")
    manifest_raw = (BACKEND_ROOT / "storage_manifest.json").read_bytes()
    spec = next(d for d in json.loads(manifest_raw)["datasets"] if d["slug"] == dataset_slug)
    if spec.get("inputFormat") != "metaphlan4_taxonomy":
        raise ValueError("Only the declared MetaPhlAn species input is supported.")
    source = local_path((BACKEND_ROOT / spec["file"]).relative_to(BACKEND_ROOT.parent).as_posix())
    metadata = local_path((BACKEND_ROOT / spec["sampleMetadataFile"]).relative_to(BACKEND_ROOT.parent).as_posix())
    source_raw, metadata_raw = source.read_bytes(), metadata.read_bytes()
    matrix, preprocessing = normalize_metaphlan(source, metadata)
    with connect() as conn:
        row = conn.execute("""SELECT r.id,r.revision_key,r.source_sha256,r.abundance_scale,r.normalization,r.validation_json
            FROM datasets d JOIN dataset_revisions r ON r.id=d.current_revision_id
            WHERE d.slug=? AND d.status='published' AND r.status='published'""", (dataset_slug,)).fetchone()
        if row is None:
            raise ValueError("No published primary species revision.")
        revision = dict(row)
        samples = [dict(r) for r in conn.execute(
            "SELECT sample_code,phenotype FROM revision_sample_info WHERE revision_id=?", (row["id"],)).fetchall()]
        observations = [dict(r) for r in conn.execute("""SELECT s.sample_code,t.full_taxonomy,a.abundance
            FROM revision_species_abundance a
            JOIN revision_sample_info s ON s.sample_id=a.sample_id AND s.revision_id=a.revision_id
            JOIN taxon_anno t ON t.taxon_id=a.taxon_id WHERE a.revision_id=?""", (row["id"],)).fetchall()]
    if (revision["source_sha256"] != sha(source_raw) or revision["abundance_scale"] != "relative_abundance"
            or "MetaPhlAn 4" not in (revision["normalization"] or "")):
        raise ValueError("Published revision does not match the original MetaPhlAn source/unit.")
    expected = matrix.set_index("sample_id")
    labels = {r["sample_code"]: r["phenotype"] for r in samples}
    mapped = {r["run_accession"]: r["stage"] for r in covariates}
    if len(labels) != len(samples) or labels != mapped or expected["Group"].to_dict() != mapped:
        raise ValueError("Published, source and mapped sample labels differ.")
    features = [c for c in expected.columns if c != "Group"]
    published = pd.DataFrame(observations).pivot(index="sample_code", columns="full_taxonomy", values="abundance")
    if (set(published.index) != set(expected.index) or set(published.columns) != set(features)
            or len(features) != json.loads(revision["validation_json"])["featureCount"]):
        raise ValueError("Published feature/sample membership is incomplete or different.")
    values = published.loc[expected.index, features].to_numpy(dtype=float)
    expected_values = expected[features].to_numpy(dtype=float)
    # normalized_import intentionally omits species zeros. Only the explicit
    # original zero can justify an absent DB cell; missing positive values fail.
    absent = np.isnan(values)
    if np.any(absent & (expected_values != 0)):
        raise ValueError("Published matrix is missing a nonzero source observation.")
    if not np.allclose(np.where(absent, 0., values), expected_values, rtol=1e-12, atol=1e-14):
        raise ValueError("Published abundance values differ from the original species matrix.")
    historical = []
    for s in previous["sources"]:
        try:
            raw = local_path(s["path"]).read_bytes()
            status = "verified" if len(raw) == s["bytes"] and sha(raw) == s["sha256"] else "integrity_error"
        except (OSError, ValueError):
            status = "unavailable"
        historical.append({**s, "availability": status})
    return {"previousRaw": previous_raw, "previous": previous, "mappingRaw": mapping_raw,
            "manifestRaw": manifest_raw, "source": source, "sourceRaw": source_raw,
            "metadata": metadata, "metadataRaw": metadata_raw, "historical": historical,
            "verification": {"datasetSlug": dataset_slug, "sourceRevision": revision["revision_key"],
                "sourceSha256": sha(source_raw), "sampleMetadataSha256": sha(metadata_raw),
                "sampleCount": len(ids), "sampleSetSha256": previous["sampleSetSha256"], "groupCounts": groups,
                "speciesFeatureCount": len(features), "comparedAbundanceCells": int(expected_values.size),
                "publishedObservations": len(observations), "verifiedImplicitSourceZeros": int(absent.sum()),
                "matrixComparison": {"status": "passed", "rtol": 1e-12, "atol": 1e-14},
                "preprocessing": preprocessing, "participantIdsAvailable": sum(bool(r["host_subject_id_raw"]) for r in covariates)}}


def rebind(output: Path, dataset_slug: str = "ad-nc-species", *, apply: bool = False) -> dict:
    output = output.resolve()
    root = BACKEND_ROOT.parent.resolve()
    if not output.is_relative_to(root) or output.exists():
        raise ValueError("Choose a new snapshot directory inside this repository.")
    verified = verify_inputs(dataset_slug)
    check, previous = verified["verification"], verified["previous"]
    result = {"status": "verified", **check, "historicalSourceChecks": dict(Counter(s["availability"] for s in verified["historical"])),
              "applied": False, "snapshotDirectory": output.relative_to(root).as_posix()}
    if not apply:
        return result
    now = datetime.now(UTC).isoformat()
    def encode(value):
        return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()
    files = {"previous-context.json": verified["previousRaw"], "primary-sample-map.tsv": verified["mappingRaw"],
             "primary-import-manifest.json": verified["manifestRaw"], "verification.json": encode({**result, "verifiedAt": now}),
             "historical-source-checks.json": encode(verified["historical"])}
    sources = []
    for sid, name in [("primary-sample-map", "primary-sample-map.tsv"), ("primary-import-manifest", "primary-import-manifest.json"),
                      ("primary-local-input-verification", "verification.json")]:
        raw = files[name]
        sources.append({"sourceId": sid, "path": (output / name).relative_to(root).as_posix(), "sha256": sha(raw),
                        "bytes": len(raw), "origin": "local_project_record", "url": previous["projectUrl"], "retrievedAt": now})
    for sid, key in [("primary-species-matrix", "source"), ("primary-species-metadata", "metadata")]:
        raw = verified[key + "Raw"]
        sources.append({"sourceId": sid, "path": verified[key].relative_to(root).as_posix(), "sha256": sha(raw),
                        "bytes": len(raw), "origin": "local_project_record", "url": previous["projectUrl"], "retrievedAt": now})
    # Keep available original supplements, without claiming their missing
    # companion archives or deriving participant identities from them.
    sources.extend({k: v for k, v in s.items() if k != "availability"} for s in verified["historical"]
                   if s["sourceId"] in {"primary-study-method-supplement", "primary-study-sample-supplement"}
                   and s["availability"] == "verified")
    identity = "依据已核验的本地 Run 样本映射与已发布矩阵分组；探索性计算采用独立观测假设，未完成逐人 ID 核验或跨队列独立性认证。旧版完整来源归档未恢复，不沿用其人数认证。"
    context = {"schemaVersion": 1, "recordedOn": now[:10], "cohortId": previous["cohortId"],
               "sampleCount": check["sampleCount"], "sampleSetSha256": check["sampleSetSha256"], "groupCounts": check["groupCounts"],
               "sourceRevision": check["sourceRevision"], "sourceSha256": check["sourceSha256"], "datasetSlug": dataset_slug,
               "evidenceScope": "verified_local_analysis_inputs", "projectUrl": previous["projectUrl"], "publicationUrl": previous["publicationUrl"],
               "selection": f"使用当前已发布的 {check['sampleCount']} 个 AD/NC Run；原始矩阵、分组表与固定样本映射逐行一致，未增加或排除样本。",
               "participantStatus": "run_level_mapping_no_rowwise_subject_verification", "participantNote": identity,
               "crossCohortNote": "样本分组及来源登记不证明与 GMrepo 或其他研究的参与者互不重叠。",
               "pipelineNote": "本次从原始 MetaPhlAn 种级表重读百分数并除以 100，与已发布矩阵逐值比较；未重跑测序分析或推定工具精确版本。",
               "identityBasis": identity, "historicalContext": {"path": (output / "previous-context.json").relative_to(root).as_posix(),
                   "sha256": sha(verified["previousRaw"]), "sourceChecksPath": (output / "historical-source-checks.json").relative_to(root).as_posix(),
                   "note": "原登记和缺失/变化情况完整保留；新登记只覆盖当前已核验的本地分析输入。"}, "sources": sources}
    files["primary-context.json"] = encode(context)
    # Recheck mutable inputs immediately before publishing the new context.
    if (evidence.CONTEXT_PATH.read_bytes() != verified["previousRaw"]
            or (BACKEND_ROOT / "storage_manifest.json").read_bytes() != verified["manifestRaw"]
            or verified["source"].read_bytes() != verified["sourceRaw"]
            or verified["metadata"].read_bytes() != verified["metadataRaw"]):
        raise ValueError("Inputs changed during verification; nothing published.")
    output.mkdir(parents=True)
    for name, raw in files.items():
        (output / name).write_bytes(raw)
    with tempfile.NamedTemporaryFile(dir=evidence.CONTEXT_PATH.parent, prefix=".primary-context-", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(files["primary-context.json"])
    try:
        temporary.chmod(evidence.CONTEXT_PATH.stat().st_mode & 0o777)
        os.replace(temporary, evidence.CONTEXT_PATH)
    finally:
        temporary.unlink(missing_ok=True)
    return {**result, "applied": True, "contextFingerprint": sha(files["primary-context.json"])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--dataset", default="ad-nc-species")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(rebind(args.output, args.dataset, apply=args.apply), ensure_ascii=False, indent=2))
