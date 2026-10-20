"""Import one declared cohort from raw; no MAG package preparation step."""
import argparse
import json
from pathlib import Path

from app.core.config import SETTINGS
from app.core.migrations import upgrade_database
from app.core.storage_paths import DEFAULT_MANIFEST
from app.services.cohort_import import import_cohort


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', default=SETTINGS.mag_dataset)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    upgrade_database()
    result = import_cohort(args.dataset, args.manifest, publish=not args.validate_only)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
