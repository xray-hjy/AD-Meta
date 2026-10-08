"""Small search responses over complete versioned catalogs; no statistics or mapping inference."""
from __future__ import annotations

from collections import defaultdict
from difflib import SequenceMatcher
from typing import Any

from app.services.mag_data_service import MagDataset


def suggestions(data: MagDataset, *, context: str, query: str, limit: int) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    names: dict[str, set[str]] = defaultdict(set)
    if context == "lineage":
        for row in data.lineage:
            if not row["isRepresentative"]:
                continue
            entries.append({"key": f"cluster:{row['clusterId']}", "value": row["clusterId"],
                            "label": row["clusterId"], "detail": row["representativeMag"], "kind": "聚类"})
        source = [{"magId": row["magId"], **{key: row.get(key) for key in ("species",)}} for row in data.taxonomy]
    else:
        source = list(data.crosswalk)
    for row in source:
        mag_id = row["magId"]
        taxon_names = [str(row[key]) for key in ("species", "gtdbSpecies", "ncbiOrganismName", "krakenSpeciesName") if row.get(key)]
        entries.append({"key": f"mag:{mag_id}", "value": mag_id,
                        "label": taxon_names[0] if taxon_names else mag_id, "detail": mag_id,
                        "kind": "代表 MAG", "aliases": taxon_names})
        for name in taxon_names:
            names[name].add(mag_id)
    for name, ids in names.items():
        entries.append({"key": f"taxon:{name}", "value": name, "label": name,
                        "detail": f"{len(ids)} 个代表 MAG · 分类名称检索", "kind": "分类", "count": len(ids)})
    needle = query.strip().casefold()
    ranked = []
    for entry in entries:
        identifiers = [entry["value"].casefold(), entry["detail"].casefold()] if entry["kind"] != "分类" else []
        labels = [entry["label"].casefold(), *(name.casefold() for name in entry.get("aliases", []))]
        score = 0 if not needle or needle in identifiers else 1 if any(value.startswith(needle) for value in identifiers) else None
        if score is None:
            score = 2 if needle in labels else 3 if any(value.startswith(needle) for value in labels) else 4 if any(needle in value for value in [*identifiers, *labels]) else None
        # Never approximate identifiers. Name similarity only offers a confirmed suggestion.
        if score is None and len(needle) >= 4 and entry["kind"] == "分类":
            if SequenceMatcher(None, needle, entry["label"].casefold()).ratio() >= 0.72:
                score = 5
                entry["approximate"] = True
        if score is not None:
            ranked.append((score, 0 if entry["kind"] == "分类" else 1, entry["key"], entry))
    ranked.sort(key=lambda item: item[:3])
    return {"revision": data.fingerprint, "query": query, "total": len(ranked),
            "items": [{key: value for key, value in item[3].items() if key != "aliases"} for item in ranked[:limit]]}
