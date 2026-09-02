"""Validate the configured external MAG package without changing any files/DB."""
import json
import sys

from app.services.mag_data_service import MagDataError, MagScope, load_mag_dataset, overview


def main() -> int:
    try:
        result = {"status": "valid", **overview(load_mag_dataset(), MagScope())}
    except MagDataError as exc:
        print(json.dumps({"status": "invalid", **exc.report}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
