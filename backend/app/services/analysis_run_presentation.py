"""Mutable UI labels and selection policy, separate from immutable results."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

PRESENTATION_PATH = Path(__file__).resolve().parents[2] / "metadata" / "analysis_run_presentation.json"


class RunPresentation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    selectorVisible: bool = True
    isDefault: bool = False


class PresentationCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runs: dict[str, RunPresentation] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_default(self):
        defaults = [run for run in self.runs.values() if run.isDefault]
        if len(defaults) > 1 or any(not run.selectorVisible for run in defaults):
            raise ValueError("At most one default run is allowed and it must be selectable")
        return self


def present_analysis_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog = PresentationCatalog.model_validate_json(PRESENTATION_PATH.read_text(encoding="utf-8"))
    presented = []
    for run in runs:
        presentation = catalog.runs.get(run["key"], RunPresentation())
        presented.append({
            **run,
            "name": presentation.name or run["name"],
            "selectorVisible": presentation.selectorVisible,
            "isDefault": presentation.isDefault,
        })
    # Stable within each group; no inferred recency, tool or sample-count policy.
    return sorted(presented, key=lambda run: (not run["isDefault"], not run["selectorVisible"]))
