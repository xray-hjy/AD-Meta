-- AD-Meta base MySQL schema snapshot (structure only, no scientific or business rows).
-- Includes Species, KO, dataset revisions, analysis identity, projection audit, and reference evidence.
-- Generated from the validated local MySQL schema on 2026-09-18; retired MAG package tables removed.
-- Run Alembic migrations after this snapshot to create current cohort artifact tables.

CREATE DATABASE IF NOT EXISTS `ad_meta`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE `ad_meta`;

SET @AD_META_OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
CREATE TABLE IF NOT EXISTS `ad_disease_marker` (
  `marker_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `taxon_id` bigint unsigned NOT NULL,
  `study_id` varchar(128) DEFAULT NULL,
  `disease` varchar(128) NOT NULL DEFAULT 'AD',
  `direction` varchar(64) NOT NULL DEFAULT '',
  `effect_metric` varchar(64) NOT NULL DEFAULT '',
  `effect_size` double DEFAULT NULL,
  `sample_size` int unsigned DEFAULT NULL,
  `p_value` double DEFAULT NULL,
  `q_value` double DEFAULT NULL,
  `consistency` varchar(128) NOT NULL DEFAULT '',
  `evidence_level` varchar(64) NOT NULL DEFAULT '',
  `source_database` varchar(128) NOT NULL DEFAULT 'GMrepo',
  `study_source` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`marker_id`),
  KEY `idx_ad_marker_taxon_disease` (`taxon_id`,`disease`),
  KEY `idx_ad_marker_study` (`study_id`),
  CONSTRAINT `fk_ad_marker_study` FOREIGN KEY (`study_id`) REFERENCES `ref_study` (`study_id`),
  CONSTRAINT `fk_ad_marker_taxon` FOREIGN KEY (`taxon_id`) REFERENCES `taxon_anno` (`taxon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `analysis_artifact_samples` (
  `artifact_id` bigint unsigned NOT NULL,
  `run_sample_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`artifact_id`,`run_sample_id`),
  KEY `idx_analysis_artifact_samples_sample` (`run_sample_id`),
  CONSTRAINT `fk_analysis_artifact_samples_artifact` FOREIGN KEY (`artifact_id`) REFERENCES `analysis_artifacts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_analysis_artifact_samples_sample` FOREIGN KEY (`run_sample_id`) REFERENCES `analysis_run_samples` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `analysis_artifacts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `analysis_run_id` bigint unsigned NOT NULL,
  `artifact_key` varchar(191) NOT NULL,
  `artifact_type` varchar(64) NOT NULL,
  `dataset_id` bigint unsigned DEFAULT NULL,
  `dataset_revision_id` bigint unsigned DEFAULT NULL,
  `uri` varchar(1024) NOT NULL DEFAULT '',
  `sha256` char(64) NOT NULL DEFAULT '',
  `size_bytes` bigint unsigned NOT NULL DEFAULT '0',
  `schema_version` varchar(32) NOT NULL DEFAULT '1.0',
  `metadata_json` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_artifacts_run_key` (`analysis_run_id`,`artifact_key`),
  KEY `idx_analysis_artifacts_run_type` (`analysis_run_id`,`artifact_type`),
  KEY `idx_analysis_artifacts_dataset_revision` (`dataset_revision_id`),
  KEY `fk_analysis_artifacts_dataset` (`dataset_id`),
  CONSTRAINT `fk_analysis_artifacts_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_artifacts_revision` FOREIGN KEY (`dataset_revision_id`) REFERENCES `dataset_revisions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_artifacts_run` FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `analysis_run_samples` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `analysis_run_id` bigint unsigned NOT NULL,
  `sample_code` varchar(191) NOT NULL,
  `phenotype` varchar(32) NOT NULL,
  `cohort_key` varchar(191) NOT NULL DEFAULT '',
  `source_study` varchar(255) NOT NULL DEFAULT '',
  `metadata_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_run_samples_code` (`analysis_run_id`,`sample_code`),
  KEY `idx_analysis_run_samples_run_phenotype` (`analysis_run_id`,`phenotype`),
  CONSTRAINT `fk_analysis_run_samples_run` FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `analysis_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `run_key` varchar(191) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'published',
  `manifest_version` varchar(32) NOT NULL,
  `manifest_sha256` char(64) NOT NULL,
  `pipeline_json` json DEFAULT NULL,
  `parameters_json` json DEFAULT NULL,
  `reference_databases_json` json DEFAULT NULL,
  `provenance_json` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `published_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_runs_key` (`run_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `chart_artifacts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `chart_type` varchar(64) NOT NULL,
  `cache_path` varchar(1024) NOT NULL,
  `params_hash` varchar(64) NOT NULL DEFAULT '',
  `compute_version` varchar(64) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_chart_artifacts_dataset_chart` (`dataset_id`,`chart_type`),
  KEY `idx_chart_artifacts_dataset_id` (`dataset_id`),
  CONSTRAINT `fk_chart_artifacts_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dataset_revisions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `revision_key` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'computing',
  `abundance_scale` varchar(32) NOT NULL DEFAULT 'unknown',
  `normalization` varchar(64) NOT NULL DEFAULT 'unknown',
  `missing_value_policy` varchar(32) NOT NULL DEFAULT 'error',
  `covariates_json` json DEFAULT NULL,
  `source_json` json DEFAULT NULL,
  `source_sha256` char(64) NOT NULL,
  `source_file_size` bigint unsigned NOT NULL,
  `compute_version` varchar(64) NOT NULL,
  `params_hash` char(64) NOT NULL,
  `validation_json` json DEFAULT NULL,
  `warnings_json` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `published_at` datetime(6) DEFAULT NULL,
  `error` longtext,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dataset_revisions_key` (`revision_key`),
  KEY `idx_dataset_revisions_dataset_status` (`dataset_id`,`status`,`id`),
  CONSTRAINT `fk_dataset_revisions_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `datasets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(191) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `original_filename` varchar(255) NOT NULL DEFAULT '',
  `file_type` varchar(32) NOT NULL DEFAULT '',
  `file_size` bigint unsigned NOT NULL DEFAULT '0',
  `status` varchar(32) NOT NULL DEFAULT 'importing',
  `sample_count` int unsigned NOT NULL DEFAULT '0',
  `species_count` int unsigned NOT NULL DEFAULT '0',
  `feature_count` int unsigned NOT NULL DEFAULT '0',
  `feature_kind` varchar(32) NOT NULL DEFAULT 'taxonomy',
  `feature_label` varchar(32) NOT NULL DEFAULT '物种',
  `group_counts_json` json DEFAULT NULL,
  `import_warnings_json` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `published_at` datetime(6) DEFAULT NULL,
  `current_revision_id` bigint unsigned DEFAULT NULL,
  `analysis_status` varchar(32) NOT NULL DEFAULT 'exploratory_only',
  `provenance_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_datasets_slug` (`slug`),
  KEY `idx_datasets_status_published_at` (`status`,`published_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `import_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `status` varchar(32) NOT NULL,
  `stage` varchar(64) NOT NULL DEFAULT '',
  `message` varchar(255) NOT NULL DEFAULT '',
  `error` longtext,
  `started_at` datetime(6) NOT NULL,
  `finished_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_import_jobs_dataset_started` (`dataset_id`,`started_at`),
  KEY `idx_import_jobs_status_started` (`status`,`started_at`),
  CONSTRAINT `fk_import_jobs_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ko_abundance` (
  `ko_abundance_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `sample_id` bigint unsigned NOT NULL,
  `ko_id` varchar(16) NOT NULL,
  `abundance` double NOT NULL,
  PRIMARY KEY (`ko_abundance_id`),
  UNIQUE KEY `uk_ko_abundance_dataset_sample_ko` (`dataset_id`,`sample_id`,`ko_id`),
  KEY `idx_ko_abundance_ko_dataset` (`ko_id`,`dataset_id`),
  KEY `idx_ko_abundance_sample_dataset` (`sample_id`,`dataset_id`),
  CONSTRAINT `fk_ko_abundance_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ko_abundance_ko` FOREIGN KEY (`ko_id`) REFERENCES `ko_anno` (`ko_id`),
  CONSTRAINT `fk_ko_abundance_sample` FOREIGN KEY (`sample_id`) REFERENCES `sample_info` (`sample_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ko_anno` (
  `ko_id` varchar(16) NOT NULL,
  `ko_name` varchar(512) NOT NULL DEFAULT '',
  `pathway` varchar(255) NOT NULL DEFAULT '',
  `module` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`ko_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `projection_audit_artifacts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `analysis_run_id` bigint unsigned NOT NULL,
  `source_artifact_id` bigint unsigned NOT NULL,
  `projection_key` char(64) NOT NULL,
  `projection_kind` varchar(64) NOT NULL,
  `section_key` varchar(64) NOT NULL,
  `source_revision_key` varchar(191) NOT NULL,
  `compute_version` varchar(64) NOT NULL,
  `schema_version` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `storage_uri` varchar(1024) NOT NULL DEFAULT '',
  `sha256` char(64) NOT NULL DEFAULT '',
  `row_count` bigint unsigned NOT NULL DEFAULT '0',
  `metadata_json` json DEFAULT NULL,
  `error_message` text NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `retention_class` varchar(32) NOT NULL DEFAULT 'temporary',
  `last_accessed_at` datetime(6) DEFAULT NULL,
  `expires_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_projection_audit_artifact_identity` (`source_artifact_id`,`projection_key`,`section_key`,`compute_version`,`schema_version`),
  KEY `idx_projection_audit_artifacts_lookup` (`source_artifact_id`,`projection_key`,`section_key`,`status`),
  KEY `fk_projection_audit_artifacts_run` (`analysis_run_id`),
  KEY `idx_projection_audit_artifacts_expiry` (`retention_class`,`expires_at`),
  CONSTRAINT `fk_projection_audit_artifacts_run` FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_projection_audit_artifacts_source` FOREIGN KEY (`source_artifact_id`) REFERENCES `analysis_artifacts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `projection_audit_rows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `audit_artifact_id` bigint unsigned NOT NULL,
  `row_index` bigint unsigned NOT NULL,
  `feature` varchar(512) NOT NULL DEFAULT '',
  `status_code` varchar(64) NOT NULL DEFAULT '',
  `reason_code` varchar(128) NOT NULL DEFAULT '',
  `row_json` json NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_projection_audit_rows_index` (`audit_artifact_id`,`row_index`),
  KEY `idx_projection_audit_rows_feature` (`audit_artifact_id`,`feature`(191)),
  KEY `idx_projection_audit_rows_status_reason` (`audit_artifact_id`,`status_code`,`reason_code`),
  CONSTRAINT `fk_projection_audit_rows_artifact` FOREIGN KEY (`audit_artifact_id`) REFERENCES `projection_audit_artifacts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ref_sample_info` (
  `ref_sample_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `study_id` varchar(128) NOT NULL,
  `data_source` varchar(128) NOT NULL DEFAULT 'GMrepo',
  `phenotype` varchar(64) NOT NULL,
  `citation` text NOT NULL,
  PRIMARY KEY (`ref_sample_id`),
  KEY `idx_ref_sample_study_phenotype` (`study_id`,`phenotype`),
  CONSTRAINT `fk_ref_sample_study` FOREIGN KEY (`study_id`) REFERENCES `ref_study` (`study_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ref_study` (
  `study_id` varchar(128) NOT NULL,
  `data_source` varchar(128) NOT NULL DEFAULT 'GMrepo',
  `citation` text NOT NULL,
  `source_database` varchar(128) NOT NULL DEFAULT 'GMrepo',
  PRIMARY KEY (`study_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `revision_chart_artifacts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `revision_id` bigint unsigned NOT NULL,
  `chart_type` varchar(64) NOT NULL,
  `cache_path` varchar(1024) NOT NULL,
  `sha256` char(64) NOT NULL,
  `size_bytes` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_revision_chart_artifacts` (`revision_id`,`chart_type`),
  CONSTRAINT `fk_revision_chart_revision` FOREIGN KEY (`revision_id`) REFERENCES `dataset_revisions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `revision_ko_abundance` (
  `ko_abundance_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `revision_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned NOT NULL,
  `sample_id` bigint unsigned NOT NULL,
  `ko_id` varchar(16) NOT NULL,
  `abundance` double NOT NULL,
  PRIMARY KEY (`ko_abundance_id`),
  UNIQUE KEY `uk_revision_ko_abundance` (`revision_id`,`sample_id`,`ko_id`),
  KEY `idx_revision_ko_dataset` (`ko_id`,`dataset_id`),
  KEY `fk_revision_ko_sample` (`sample_id`),
  CONSTRAINT `fk_revision_ko_annotation` FOREIGN KEY (`ko_id`) REFERENCES `ko_anno` (`ko_id`),
  CONSTRAINT `fk_revision_ko_revision` FOREIGN KEY (`revision_id`) REFERENCES `dataset_revisions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_revision_ko_sample` FOREIGN KEY (`sample_id`) REFERENCES `revision_sample_info` (`sample_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `revision_sample_info` (
  `sample_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `revision_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned NOT NULL,
  `sample_code` varchar(128) NOT NULL,
  `phenotype` enum('AD','NC') NOT NULL,
  `seq_platform` varchar(128) NOT NULL DEFAULT '',
  `batch_id` varchar(128) NOT NULL DEFAULT '',
  `data_source` varchar(128) NOT NULL DEFAULT 'self_analysis',
  PRIMARY KEY (`sample_id`),
  UNIQUE KEY `uk_revision_sample_code` (`revision_id`,`sample_code`),
  KEY `idx_revision_sample_dataset` (`dataset_id`,`phenotype`),
  CONSTRAINT `fk_revision_sample_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_revision_sample_revision` FOREIGN KEY (`revision_id`) REFERENCES `dataset_revisions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `revision_species_abundance` (
  `abundance_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `revision_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned NOT NULL,
  `sample_id` bigint unsigned NOT NULL,
  `taxon_id` bigint unsigned NOT NULL,
  `abundance` double NOT NULL,
  PRIMARY KEY (`abundance_id`),
  UNIQUE KEY `uk_revision_species_abundance` (`revision_id`,`sample_id`,`taxon_id`),
  KEY `idx_revision_species_taxon_dataset` (`taxon_id`,`dataset_id`),
  KEY `fk_revision_species_sample` (`sample_id`),
  CONSTRAINT `fk_revision_species_revision` FOREIGN KEY (`revision_id`) REFERENCES `dataset_revisions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_revision_species_sample` FOREIGN KEY (`sample_id`) REFERENCES `revision_sample_info` (`sample_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_revision_species_taxon` FOREIGN KEY (`taxon_id`) REFERENCES `taxon_anno` (`taxon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sample_info` (
  `sample_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `sample_code` varchar(128) NOT NULL,
  `phenotype` enum('AD','NC','OTHER') NOT NULL,
  `seq_platform` varchar(128) NOT NULL DEFAULT '',
  `batch_id` varchar(128) NOT NULL DEFAULT '',
  `data_source` varchar(128) NOT NULL DEFAULT 'self_analysis',
  PRIMARY KEY (`sample_id`),
  UNIQUE KEY `uk_sample_info_dataset_code` (`dataset_id`,`sample_code`),
  KEY `idx_sample_info_dataset_phenotype` (`dataset_id`,`phenotype`),
  CONSTRAINT `fk_sample_info_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `species_abundance` (
  `abundance_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `sample_id` bigint unsigned NOT NULL,
  `taxon_id` bigint unsigned NOT NULL,
  `abundance` double NOT NULL,
  PRIMARY KEY (`abundance_id`),
  UNIQUE KEY `uk_species_abundance_dataset_sample_taxon` (`dataset_id`,`sample_id`,`taxon_id`),
  KEY `idx_species_abundance_taxon_dataset` (`taxon_id`,`dataset_id`),
  KEY `idx_species_abundance_sample_dataset` (`sample_id`,`dataset_id`),
  CONSTRAINT `fk_species_abundance_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_species_abundance_sample` FOREIGN KEY (`sample_id`) REFERENCES `sample_info` (`sample_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_species_abundance_taxon` FOREIGN KEY (`taxon_id`) REFERENCES `taxon_anno` (`taxon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `taxon_anno` (
  `taxon_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `kingdom` varchar(128) NOT NULL DEFAULT '',
  `phylum` varchar(128) NOT NULL DEFAULT '',
  `class` varchar(128) NOT NULL DEFAULT '',
  `tax_order` varchar(128) NOT NULL DEFAULT '',
  `family` varchar(128) NOT NULL DEFAULT '',
  `genus` varchar(128) NOT NULL DEFAULT '',
  `species` varchar(255) NOT NULL DEFAULT '',
  `full_taxonomy` text NOT NULL,
  `taxon_rank` varchar(32) NOT NULL DEFAULT 'species',
  `canonical_name` varchar(255) NOT NULL,
  `taxonomy_source` varchar(64) NOT NULL DEFAULT 'input',
  `taxonomy_version` varchar(64) NOT NULL DEFAULT '',
  `taxonomy_hash` char(64) NOT NULL,
  PRIMARY KEY (`taxon_id`),
  UNIQUE KEY `uk_taxon_anno_hash` (`taxonomy_hash`),
  KEY `idx_taxon_anno_canonical_name` (`canonical_name`),
  KEY `idx_taxon_anno_rank_name` (`taxon_rank`,`canonical_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = @AD_META_OLD_FOREIGN_KEY_CHECKS;

-- Stamp the retired package revision as a bridge; its table creation is now a no-op.
-- Apply Alembic upgrades to create the current cohort tables and reach the current head.
INSERT INTO `alembic_version` (`version_num`)
SELECT '20260912_01'
WHERE NOT EXISTS (SELECT 1 FROM `alembic_version`);
