from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PipelineManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    version: str = "unknown"


class ArtifactManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    key: str
    type: str
    dataset_slug: str = Field(alias="datasetSlug")
    schema_version: str = Field(default="1.0", alias="schemaVersion")

    @field_validator("key", "type", "dataset_slug")
    @classmethod
    def require_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be empty")
        return normalized


class AnalysisRunManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    key: str
    name: str
    description: str = ""
    status: str = "published"
    pipeline: PipelineManifest
    parameters: dict = Field(default_factory=dict)
    reference_databases: list[dict] = Field(default_factory=list, alias="referenceDatabases")
    provenance: dict = Field(default_factory=dict)
    artifacts: list[ArtifactManifest]

    @field_validator("key", "name")
    @classmethod
    def require_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be empty")
        return normalized

    @field_validator("artifacts")
    @classmethod
    def unique_artifact_keys(cls, artifacts: list[ArtifactManifest]) -> list[ArtifactManifest]:
        if not artifacts:
            raise ValueError("must contain at least one artifact")
        keys = [artifact.key for artifact in artifacts]
        if len(keys) != len(set(keys)):
            raise ValueError("artifact keys must be unique within a run")
        return artifacts


class StorageManifest(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    manifest_version: str = Field(default="1.0", alias="manifestVersion")
    analysis_runs: list[AnalysisRunManifest] = Field(
        default_factory=list,
        alias="analysisRuns",
    )

    @field_validator("analysis_runs")
    @classmethod
    def unique_run_keys(cls, runs: list[AnalysisRunManifest]) -> list[AnalysisRunManifest]:
        keys = [run.key for run in runs]
        if len(keys) != len(set(keys)):
            raise ValueError("analysis run keys must be unique")
        return runs


def load_analysis_manifest(path: Path) -> StorageManifest:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Analysis manifest not found: {resolved}")
    return StorageManifest.model_validate_json(resolved.read_text(encoding="utf-8"))


def canonical_manifest_json(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
