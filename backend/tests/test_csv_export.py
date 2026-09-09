from __future__ import annotations

import csv
import io

from app.services.csv_export import SpreadsheetSafeDictWriter, spreadsheet_safe_cell


def test_spreadsheet_safe_cell_protects_formula_strings_only() -> None:
    for value in ("=1+1", "+cmd", "-formula", "@link", " \t=hidden"):
        assert spreadsheet_safe_cell(value).startswith("'")
    assert spreadsheet_safe_cell("normal") == "normal"
    assert spreadsheet_safe_cell("value=1") == "value=1"
    assert spreadsheet_safe_cell(-1.25) == -1.25
    assert spreadsheet_safe_cell(None) is None


def test_safe_writer_protects_dynamic_headers_and_preserves_csv_syntax() -> None:
    stream = io.StringIO()
    writer = SpreadsheetSafeDictWriter(stream, ["sample", "=dynamic"])
    writer.writeheader()
    writer.writerow({"sample": "\t@formula", "=dynamic": 'text, with "quotes"'})
    rows = list(csv.reader(io.StringIO(stream.getvalue())))
    assert rows[0] == ["sample", "'=dynamic"]
    assert rows[1] == ["'\t@formula", 'text, with "quotes"']
