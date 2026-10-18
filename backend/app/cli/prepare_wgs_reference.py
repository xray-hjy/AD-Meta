"""Normalize author's public unfiltered taxonomic tables; descriptive stage reference only."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

from app.cli.inventory_gmrepo import write_json
from app.core.config import BACKEND_ROOT


def prepare(root: Path) -> dict:
    target = root / "reference.json"
    if target.exists():
        raise ValueError("Reference exists; use a new version directory")
    inputs = root / "extracted"
    meta = list(csv.DictReader((inputs / "participants.tsv").open(encoding="utf-8-sig"), delimiter="\t"))
    profiles = list(csv.DictReader((inputs / "taxonomic_profiles.tsv").open(encoding="utf-8-sig"), delimiter="\t"))
    ids = [r["Participant"] for r in meta]
    if len(set(ids)) != len(ids) or any(r["CDR"] != "0" or r["amyloid.positive.AF"] not in {"0", "1"} for r in meta):
        raise ValueError("Invalid author metadata or stages")
    profile_ids = set(profiles[0]) - {"clade_name", "NCBI_tax_id"}
    if not set(ids) <= profile_ids:
        raise ValueError("Metadata participants missing in profile; no zero imputation")
    samples = [{"participantId": r["Participant"], "group": "preclinical_AD" if r["amyloid.positive.AF"] == "1" else "biomarker_negative_CN",
                "age": float(r["Age"]), "sexCode": r["Sex"], "cdr": 0} for r in meta]
    features = []
    for row in profiles:
        clade = row["clade_name"]
        terminal = clade.split("|")[-1]
        level = "species" if terminal.startswith("s__") else "genus" if terminal.startswith("g__") else None
        if not level:
            continue
        values = {sid: float(row[sid]) for sid in ids}
        if not all(math.isfinite(v) and 0 <= v <= 100 for v in values.values()):
            raise ValueError("Invalid percent values")
        features.append({"featureId": "MPA3:" + hashlib.sha256(clade.encode()).hexdigest()[:20], "name": terminal[3:].replace("_", " "),
                         "level": level, "clade": clade, "sourceTaxonPath": row["NCBI_tax_id"], "values": values})
    if len({f["clade"] for f in features}) != len(features):
        raise ValueError("Duplicate taxonomic clades")
    source_root = BACKEND_ROOT.parent / "ADMetaData/reference/gmrepo/release-sources/2026-10-15-v2"
    receipts = json.loads((source_root / "receipts.json").read_bytes())["records"]
    source_rows = [r["receipt"] for r in receipts if r["kind"] == "author_file" and "receipt" in r]
    for r in source_rows:
        raw = (source_root / r["file"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != r["sha256"] or len(raw) != r["bytes"]:
            raise ValueError("Author source changed")
    result = {"schemaVersion": 1, "projectId": "PRJNA798058", "sourceProvider": "original_study", "platform": "WGS", "processingVersion": "author_MetaPhlAn3_mpa_v30_CHOCOPhlAn_201901",
              "title": "Gut microbiome composition may be an indicator of preclinical Alzheimer's disease", "studyUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10680783/",
              "sourceUrl": "https://zenodo.org/records/14991167", "unit": "relative_abundance_percent", "clinicalComparison": "preclinical_AD_vs_biomarker_negative_CN",
              "scientificReviewStatus": "pending", "inferenceStatus": "descriptive_only", "samples": samples, "features": features,
              "sourceReceipts": source_rows, "profileParticipants": len(profile_ids), "excludedProfileOnlyIds": sorted(profile_ids - set(ids)),
              "extraction": {"script": "backend/app/cli/extract_wgs_author.R", "groupLocator": "author meta$amyloid.positive.AF and CDR=0; author script plotting levels healthy/preclinical",
                             "scaleLocator": "author analysis script lines 120-123: unfiltered metaphlan3.raw, relative abundance values out of 100",
                             "featureSelection": "all terminal genus/species clades in public unfiltered table; no significance/mean-abundance selection"},
              "limits": ["原研究直接接入，不计为 GMrepo WGS 数据", "临床前 AD 与生物标志物阴性认知正常组，不是临床 AD/NC", "保留原分类路径，不认证当前 NCBI 物种或 MAG 匹配", "仅描述，不执行新 WGS 差异检验；科研、重叠与主外数值可比性待复核", "作者 sex 1/2 保留原码，不猜测男女含义"]}
    write_json(target, result)
    files = [target, inputs / "participants.tsv", inputs / "taxonomic_profiles.tsv"]
    manifest = {"schemaVersion": 1, "projectId": result["projectId"], "files": [{"path": p.relative_to(root).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bytes": p.stat().st_size} for p in files]}
    write_json(root / "manifest.json", manifest)
    return {"samples": len(samples), "groups": {g: sum(s["group"] == g for s in samples) for g in {s["group"] for s in samples}},
            "features": {level: sum(f["level"] == level for f in features) for level in ("genus", "species")}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    print(json.dumps(prepare(parser.parse_args().root), ensure_ascii=False))
