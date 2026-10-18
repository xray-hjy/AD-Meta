"""Archive official study records for the three pilot projects, without granting review."""
import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from app.cli.inventory_gmrepo import capture, write_json
from app.core.config import BACKEND_ROOT

PILOTS = ("PRJEB51982", "PRJEB59009", "PRJEB77146")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else BACKEND_ROOT.parent / args.output
    if output.exists():
        raise ValueError("Use a new archive directory; previous records are immutable.")
    output.mkdir(parents=True)
    results = []
    for project in PILOTS:
        url = f"https://www.ebi.ac.uk/ena/browser/api/xml/{project}"
        try:
            raw, receipt = capture(url, output / f"{project}.xml")
            root = ET.fromstring(raw)
            results.append({"projectId": project, "receipt": receipt,
                            "title": root.findtext(".//STUDY_TITLE") or root.findtext(".//TITLE"), "abstract": root.findtext(".//STUDY_ABSTRACT") or root.findtext(".//DESCRIPTION"),
                            "secondaryAccessions": [r.text for r in root.findall(".//SECONDARY_ID")],
                            "attributes": [{"tag": r.findtext("TAG"), "value": r.findtext("VALUE")} for r in root.findall(".//STUDY_ATTRIBUTE") + root.findall(".//PROJECT_ATTRIBUTE")],
                            "links": [ET.tostring(r, encoding="unicode") for r in root.findall(".//STUDY_LINK") + root.findall(".//PROJECT_LINK")],
                            "status": "source_record_unreviewed"})
        except (OSError, ValueError, ET.ParseError) as exc:
            results.append({"projectId": project, "url": url, "status": "failed", "error": str(exc)})
        write_json(output / "receipts.json", results)
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13082655/fullTextXML"
    try:
        raw, receipt = capture(url, output / "PMC13082655.xml")
        root = ET.fromstring(raw)
        results.append({"projectId": "PRJEB77146", "receipt": receipt, "title": root.findtext(".//article-title"),
                        "status": "source_record_unreviewed"})
    except (OSError, ValueError, ET.ParseError) as exc:
        results.append({"projectId": "PRJEB77146", "url": url, "status": "failed", "error": str(exc)})
    write_json(output / "receipts.json", results)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
