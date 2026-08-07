from __future__ import annotations

import uvicorn

from app.cli.prepare_runtime import prepare_runtime


def main() -> None:
    prepare_runtime()
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
