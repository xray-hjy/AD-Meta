"""Continue pagination to its actual end, rather than treating unique-run count as rows."""
import argparse
import hashlib
import json
import urllib.request
from datetime import UTC, datetime
from pathlib import Path


def acquire(root):
    if root.exists():
        raise ValueError("Use a new acquisition directory")
    root.mkdir(parents=True)
    receipts, ended = [], False
    for skip in range(185000, 385000, 5000):
        body = {"limit": 5000, "skip": skip}
        url = "https://gmrepo.humangut.info/api/getAllRunsAsync/"
        row = {"file": f"runs-{skip}.json", "url": url, "body": body, "retrievedAt": datetime.now(UTC).isoformat()}
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as response:
                raw = response.read()
            values = json.loads(raw)["runs"]
            (root / row["file"]).write_bytes(raw)
            row.update(status="retrieved", records=len(values), sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
            ended = len(values) < 5000
        except (OSError, ValueError, KeyError) as exc:
            row.update(status="unavailable", error=str(exc))
        receipts.append(row)
        (root / "receipts.json").write_text(json.dumps({"ended": ended, "records": receipts}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(skip, row["status"], row.get("records"), flush=True)
        if ended or row["status"] != "retrieved":
            break


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, required=True)
    acquire(p.parse_args().output)
