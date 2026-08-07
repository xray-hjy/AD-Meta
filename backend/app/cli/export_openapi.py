from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.main import app


def render_openapi() -> str:
    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def export_openapi(output: Path, *, check: bool = False) -> bool:
    rendered = render_openapi()
    if check:
        return output.is_file() and output.read_text(encoding="utf-8") == rendered
    output.write_text(rendered, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Export or verify the FastAPI OpenAPI schema")
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail when openapi.json differs without modifying it",
    )
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[2] / "openapi.json"
    if not export_openapi(output, check=args.check):
        raise SystemExit("openapi.json is stale; run python -m app.cli.export_openapi")
    print(output)


if __name__ == "__main__":
    main()
