from __future__ import annotations

import math

import httpx

from app.core.config import STATS_WORKER_URL


def main() -> None:
    if not STATS_WORKER_URL:
        raise RuntimeError("AD_META_STATS_WORKER_URL must be configured for the worker smoke test.")

    health = httpx.get(f"{STATS_WORKER_URL}/health", timeout=10)
    health.raise_for_status()
    payload = {
        "jobId": "a" * 32,
        "method": "ancombc2",
        "abundanceScale": "counts",
        "formula": "Group",
        "alpha": 0.05,
        "prevalence": 0.1,
        "samples": [
            {"Sample": f"AD{index}", "Group": "AD"} for index in range(1, 6)
        ]
        + [{"Sample": f"NC{index}", "Group": "NC"} for index in range(1, 6)],
        "features": ["K00001", "K00002", "K00003"],
        "matrix": [
            [100, 10, 40], [110, 11, 42], [120, 12, 39], [105, 10, 41], [115, 11, 40],
            [10, 100, 40], [11, 110, 41], [12, 120, 39], [10, 105, 42], [11, 115, 40],
        ],
    }
    response = httpx.post(
        f"{STATS_WORKER_URL}/v1/differential-abundance",
        json=payload,
        timeout=300,
    )
    response.raise_for_status()
    result = response.json()
    if result.get("method") != "ANCOM-BC2" or not result.get("items"):
        raise RuntimeError(f"Unexpected statistics worker response: {result}")
    for item in result["items"]:
        q_value = float(item["qValue"])
        effect = float(item["effectSize"])
        if not math.isfinite(q_value) or not 0 <= q_value <= 1 or not math.isfinite(effect):
            raise RuntimeError(f"Invalid statistics worker item: {item}")
    print(f"Statistics worker HTTP smoke passed with {len(result['items'])} feature(s).")


if __name__ == "__main__":
    main()
