"""Validated supplemental research records; they do not authorize new inference."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LedgerModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EvidenceSource(LedgerModel):
    sourceId: str = Field(min_length=1)
    url: str = Field(pattern=r"^https?://")
    path: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    bytes: int = Field(ge=0)
    retrievedAt: str | None = None
    origin: Literal["sealed_package", "new_acquisition", "local_project_record"]


class FieldAssertion(LedgerModel):
    value: str | list[str]
    rawValue: str | list[str] | None = None
    evidenceRefs: list[str] = Field(min_length=1)
    locator: str = Field(min_length=1)
    recordedOn: date


class ProjectLink(LedgerModel):
    projectId: str = Field(pattern=r"^PRJ[A-Z0-9]+$")
    studyId: str | None = None
    studyTitle: str | None = None
    country: str | None = None
    material: str | None = None
    originalStudyUrl: str | None = Field(default=None, pattern=r"^https?://")
    evidenceRefs: list[str] = Field(default_factory=list)
    facts: dict[str, FieldAssertion] = Field(default_factory=dict)
    screeningStatus: Literal["pending", "reference_available", "stage_reference", "awaiting_acquisition", "outside_scope", "insufficient_information"] = "pending"
    screeningNote: str | None = None
    screeningEvidenceRefs: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def evidence_for_assertions(self):
        if any((self.studyId, self.studyTitle, self.country, self.material, self.originalStudyUrl)) and not self.evidenceRefs:
            raise ValueError("New study assertions require locatable evidence references.")
        if self.screeningStatus != "pending" and not (self.screeningNote and self.screeningEvidenceRefs):
            raise ValueError("Screening dispositions require a reason and evidence.")
        return self


class SupplementalReview(LedgerModel):
    reviewId: str
    projectId: str = Field(pattern=r"^PRJ[A-Z0-9]+$")
    purpose: Literal["identity", "unadjusted", "adjusted", "scientific_review", "independence", "field"]
    decision: Literal["pending", "hold", "revoked", "confirmed"]
    allRunSetSha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    note: str
    evidenceRefs: list[str] = Field(default_factory=list)
    reviewer: str | None = None
    reviewedOn: date | None = None
    role: str | None = None
    scope: str = "current_project_comparison"
    comparisonFingerprint: str | None = None
    methodVersion: str | None = None
    supersedes: str | None = None
    outcome: Literal["overlap_found", "no_overlap_within_examined_scope", "inconclusive"] | None = None

    @model_validator(mode="after")
    def signed_decisions(self):
        if self.decision != "pending" and not (self.reviewer and self.reviewedOn and self.evidenceRefs):
            raise ValueError("A review decision requires a real reviewer, date and evidence references.")
        if self.decision == "pending" and self.supersedes:
            raise ValueError("Pending notes cannot supersede an effective decision.")
        return self


class IssueResolution(LedgerModel):
    projectId: str
    reasonCode: str
    status: Literal["evidence_added", "review_requested", "resolved", "not_resolvable"]
    note: str
    evidenceRefs: list[str] = Field(min_length=1)
    reviewId: str | None = None


class RelationshipReview(LedgerModel):
    reviewId: str
    relationshipId: str
    leftNode: str
    rightNode: str
    leftFingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    rightFingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    decision: Literal["pending", "hold", "revoked", "confirmed"]
    outcome: Literal["overlap_found", "no_overlap_within_examined_scope", "inconclusive"]
    examinedLevels: list[Literal["study", "participant", "specimen", "experiment", "run", "analysis_use"]] = Field(min_length=1)
    evidenceRefs: list[str] = Field(min_length=1)
    note: str = Field(min_length=1)
    reviewer: str | None = None
    role: str | None = None
    reviewedOn: date | None = None
    supersedes: str | None = None

    @model_validator(mode="after")
    def scope_and_signature(self):
        if len(set(self.examinedLevels)) != len(self.examinedLevels):
            raise ValueError("Duplicate examined levels")
        self.examinedLevels = sorted(self.examinedLevels)
        if self.leftNode >= self.rightNode:
            raise ValueError("Relationship nodes must be distinct and canonically ordered")
        if self.decision != "pending" and not (self.reviewer and self.role and self.reviewedOn):
            raise ValueError("Relationship decisions require a real reviewer/role/date")
        if self.decision == "pending" and self.supersedes:
            raise ValueError("Pending cannot supersede a relationship decision")
        return self


class ResearchRegistry(LedgerModel):
    schemaVersion: Literal[1, 2]
    version: str
    recordedOn: date
    referenceFingerprint: str
    scopeMode: Literal["retrospective_harmonization"]
    purpose: str
    searchScope: list[str]
    projects: list[ProjectLink]
    reviews: list[SupplementalReview]
    sources: list[EvidenceSource] = Field(default_factory=list)
    resolutions: list[IssueResolution] = Field(default_factory=list)
    relationshipReviews: list[RelationshipReview] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_records(self):
        if len({p.projectId for p in self.projects}) != len(self.projects):
            raise ValueError("Duplicate project links.")
        if len({r.reviewId for r in self.reviews}) != len(self.reviews):
            raise ValueError("Duplicate review identifiers.")
        projects = {p.projectId for p in self.projects}
        if any(r.projectId not in projects for r in self.reviews):
            raise ValueError("Review refers to an unregistered project.")
        sources = {s.sourceId for s in self.sources}
        if len(sources) != len(self.sources):
            raise ValueError("Duplicate evidence sources.")
        reviews = {r.reviewId: r for r in self.reviews}
        replaced = set()
        for review in self.reviews:
            if self.schemaVersion == 2 and review.decision != "pending":
                if not (review.role and review.comparisonFingerprint and review.methodVersion and set(review.evidenceRefs) <= sources):
                    raise ValueError("Version 2 decisions require a role, bound comparison/method and registered sources.")
                if review.purpose == "independence" and review.decision == "confirmed" and not review.outcome:
                    raise ValueError("Independence opinions must state their limited-scope outcome.")
            if review.supersedes:
                previous = reviews.get(review.supersedes)
                if not previous or review.supersedes in replaced:
                    raise ValueError("Missing or branched supersession.")
                if (review.projectId, review.purpose, review.scope, review.allRunSetSha256, review.comparisonFingerprint, review.methodVersion) != (previous.projectId, previous.purpose, previous.scope, previous.allRunSetSha256, previous.comparisonFingerprint, previous.methodVersion):
                    raise ValueError("Supersession cannot cross purpose or input scope.")
                replaced.add(review.supersedes)
            visited = {review.reviewId}
            current = review
            while current.supersedes:
                if current.supersedes in visited:
                    raise ValueError("Cyclic review chain.")
                visited.add(current.supersedes)
                previous = reviews.get(current.supersedes)
                if previous is None:
                    raise ValueError("Missing superseded review.")
                current = previous
        effective = [(r.projectId, r.purpose, r.scope) for r in self.reviews if r.reviewId not in replaced and r.decision != "pending"]
        if len(set(effective)) != len(effective):
            raise ValueError("Conflicting current review decisions.")
        if self.schemaVersion == 2:
            for project in self.projects:
                refs = project.evidenceRefs + project.screeningEvidenceRefs + [ref for f in project.facts.values() for ref in f.evidenceRefs]
                if not set(refs) <= sources:
                    raise ValueError("Unknown field or screening source.")
            for issue in self.resolutions:
                if issue.projectId not in projects or not set(issue.evidenceRefs) <= sources:
                    raise ValueError("Unknown issue project or source.")
                if issue.status == "resolved" and (issue.reviewId not in reviews or reviews[issue.reviewId].projectId != issue.projectId or reviews[issue.reviewId].decision != "confirmed"):
                    raise ValueError("Resolved issues require a matching confirmed review; capability gates still apply.")
        relations = {r.reviewId: r for r in self.relationshipReviews}
        if len(relations) != len(self.relationshipReviews):
            raise ValueError("Duplicate relationship review IDs")
        replaced_relations = set()
        for relation_review in self.relationshipReviews:
            if not set(relation_review.evidenceRefs) <= sources:
                raise ValueError("Unknown relationship evidence")
            if relation_review.supersedes:
                old = relations.get(relation_review.supersedes)
                scope = ("relationshipId", "leftNode", "rightNode", "leftFingerprint", "rightFingerprint", "examinedLevels")
                if not old or relation_review.supersedes in replaced_relations or any(getattr(relation_review, k) != getattr(old, k) for k in scope):
                    raise ValueError("Invalid relationship supersession scope or branch")
                replaced_relations.add(relation_review.supersedes)
            seen = {relation_review.reviewId}
            current_relation = relation_review
            while current_relation.supersedes:
                if current_relation.supersedes in seen:
                    raise ValueError("Cyclic relationship supersession")
                seen.add(current_relation.supersedes)
                current_relation = relations[current_relation.supersedes]
        keys = [(r.relationshipId, tuple(r.examinedLevels)) for r in self.relationshipReviews if r.reviewId not in replaced_relations and r.decision != "pending"]
        if len(keys) != len(set(keys)):
            raise ValueError("Conflicting relationship decisions")
        return self


class EvidenceBlocker(BaseModel):
    reasonCode: str
    projectId: str
    scope: str
    affects: list[str]
    message: str
    missingEvidence: str
    nextAction: str
    status: str = "pending"
    evidenceRefs: list[str] = Field(default_factory=list)


class CapabilityState(BaseModel):
    status: str
    reasonCodes: list[str] = Field(default_factory=list)


class ResearchField(BaseModel):
    rawValue: str | list[str] | None = None
    value: str | list[str] | None = None
    status: str
    evidenceRefs: list[str]
    locator: str | None = None


class ResearchProjectRecord(BaseModel):
    projectId: str
    studyId: str | None
    installed: bool
    sourceUrl: str | None = None
    fields: dict[str, ResearchField]
    comparison: dict
    capabilities: dict[str, CapabilityState]
    blockers: list[EvidenceBlocker]
    reviews: list[dict]
    evidenceRefs: list[str]
    screening: dict = Field(default_factory=dict)
    sources: list[dict] = Field(default_factory=list)
    issueResolutions: list[dict] = Field(default_factory=list)
    relationships: list[dict] = Field(default_factory=list)


class ResearchLedger(BaseModel):
    schemaVersion: Literal[1] = 1
    version: str
    referenceFingerprint: str
    registryFingerprint: str
    registryStatus: str
    discoveryStatus: str
    discoveryFingerprint: str | None = None
    scientificReviewStatus: str
    counts: dict[str, int]
    records: list[ResearchProjectRecord]
    acquisitions: list[dict]
    scope: dict
    sourceChecks: list[dict] = Field(default_factory=list)
    relationships: dict = Field(default_factory=dict)
