"""Dataset identity and independently revisioned source artifacts (SQLite/MySQL)."""
from sqlalchemy import Column, Float, ForeignKey, Index, MetaData, String, Table, Text
from sqlalchemy.dialects.mysql import LONGTEXT

metadata = MetaData()
payload_type = Text().with_variant(LONGTEXT(), 'mysql')

cohorts = Table('cohorts', metadata,
    Column('cohort_key', String(128), primary_key=True),
    Column('name', String(255), nullable=False),
    Column('project_accession', String(64), nullable=False),
    Column('study_accession', String(64), nullable=False),
    Column('current_release', String(64)),
    Column('created_at', String(40), nullable=False))

artifacts = Table('cohort_artifact_revisions', metadata,
    Column('revision_key', String(64), primary_key=True),
    Column('cohort_key', String(128), ForeignKey('cohorts.cohort_key'), nullable=False),
    Column('module', String(64), nullable=False),
    Column('parser_version', String(64), nullable=False),
    Column('status', String(32), nullable=False),
    Column('sources_json', payload_type, nullable=False),
    Column('report_json', payload_type, nullable=False),
    Column('created_at', String(40), nullable=False))
Index('idx_cohort_artifact_module', artifacts.c.cohort_key, artifacts.c.module)

records = Table('cohort_artifact_records', metadata,
    Column('artifact_revision', String(64), ForeignKey('cohort_artifact_revisions.revision_key'), primary_key=True),
    Column('record_kind', String(48), primary_key=True),
    Column('record_key', String(255), primary_key=True),
    Column('payload_json', payload_type, nullable=False))

abundances = Table('cohort_mag_abundances', metadata,
    Column('artifact_revision', String(64), ForeignKey('cohort_artifact_revisions.revision_key'), primary_key=True),
    Column('sample_code', String(128), primary_key=True),
    Column('mag_code', String(160), primary_key=True),
    Column('abundance_percent', Float, nullable=False))

releases = Table('cohort_releases', metadata,
    Column('release_key', String(64), primary_key=True),
    Column('cohort_key', String(128), ForeignKey('cohorts.cohort_key'), nullable=False),
    Column('artifacts_json', payload_type, nullable=False),
    Column('community_json', payload_type, nullable=False),
    Column('created_at', String(40), nullable=False))
Index('idx_cohort_releases', releases.c.cohort_key, releases.c.created_at)

jobs = Table('cohort_import_jobs', metadata,
    Column('job_key', String(64), primary_key=True),
    Column('cohort_key', String(128), nullable=False),
    Column('status', String(32), nullable=False),
    Column('release_key', String(64)),
    Column('report_json', payload_type, nullable=False),
    Column('started_at', String(40), nullable=False),
    Column('finished_at', String(40)))
