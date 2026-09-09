from __future__ import annotations

import csv
from collections.abc import Iterable, Mapping
from typing import Any, TextIO

FORMULA_PREFIXES = ("=", "+", "-", "@")


def spreadsheet_safe_cell(value: Any) -> Any:
    """Keep exported strings inert when opened by spreadsheet software."""

    if not isinstance(value, str):
        return value
    significant = value.lstrip(" \t\r\n")
    if significant.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


class SpreadsheetSafeDictWriter:
    """Protect text cells and dynamic headers only while serializing CSV."""

    def __init__(self, stream: TextIO, fieldnames: Iterable[str]):
        self._source_fields = list(fieldnames)
        self._output_fields = [str(spreadsheet_safe_cell(field)) for field in self._source_fields]
        self._writer = csv.DictWriter(stream, fieldnames=self._output_fields)

    def writeheader(self) -> None:
        self._writer.writeheader()

    def writerow(self, row: Mapping[str, Any]) -> None:
        self._writer.writerow({
            output: spreadsheet_safe_cell(row.get(source))
            for source, output in zip(self._source_fields, self._output_fields, strict=True)
        })

    def writerows(self, rows: Iterable[Mapping[str, Any]]) -> None:
        for row in rows:
            self.writerow(row)
