"""Validate the published cohort MAG result without reading delivery packages."""
import argparse
import json
import sys

from app.services.mag_analysis_service import MagDataError, MagScope, load_mag_dataset, overview


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', default='')
    parser.add_argument('--release', default='')
    args = parser.parse_args()
    try:
        result = {"status": "valid", **overview(load_mag_dataset(args.dataset, args.release), MagScope())}
    except MagDataError as exc:
        print(json.dumps({"status": "invalid", **exc.report}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
