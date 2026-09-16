SQLITE_MAG_SCHEMA = """
CREATE TABLE IF NOT EXISTS mag_dataset_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_key TEXT NOT NULL UNIQUE,
  parent_version_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'importing',
  source_root TEXT NOT NULL,
  data_fingerprint TEXT NOT NULL UNIQUE,
  manifest_sha256 TEXT NOT NULL DEFAULT '',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  sample_count INTEGER NOT NULL,
  representative_mag_count INTEGER NOT NULL,
  member_mag_count INTEGER NOT NULL DEFAULT 0,
  cluster_count INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '%',
  group_field TEXT NOT NULL DEFAULT 'disease',
  max_mapping_error REAL NOT NULL DEFAULT 0,
  validation_json TEXT NOT NULL DEFAULT '{}',
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mag_package_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version_id INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  UNIQUE(dataset_version_id, relative_path),
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mag_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  sample_code TEXT NOT NULL,
  sample_name TEXT NOT NULL DEFAULT '',
  accession TEXT NOT NULL DEFAULT '',
  disease TEXT NOT NULL,
  source_group TEXT NOT NULL DEFAULT '',
  hpc_batch TEXT NOT NULL,
  age REAL NOT NULL,
  gender TEXT NOT NULL,
  mapped_percent REAL NOT NULL,
  unmapped_percent REAL NOT NULL,
  r1_uri TEXT NOT NULL DEFAULT '',
  r2_uri TEXT NOT NULL DEFAULT '',
  coverm_label TEXT NOT NULL DEFAULT '',
  UNIQUE(dataset_version_id, sample_code),
  UNIQUE(dataset_version_id, position),
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mag_representatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  mag_code TEXT NOT NULL,
  length_bp INTEGER NOT NULL,
  UNIQUE(dataset_version_id, mag_code),
  UNIQUE(dataset_version_id, position),
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mag_taxonomy (
  representative_id INTEGER PRIMARY KEY,
  domain TEXT NOT NULL DEFAULT '',
  phylum TEXT NOT NULL DEFAULT '',
  class TEXT NOT NULL DEFAULT '',
  tax_order TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  genus TEXT NOT NULL DEFAULT '',
  species TEXT NOT NULL DEFAULT '',
  classification_method TEXT NOT NULL DEFAULT '',
  closest_reference TEXT,
  closest_ani REAL,
  closest_af REAL,
  msa_percent REAL,
  FOREIGN KEY(representative_id) REFERENCES mag_representatives(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mag_quality (
  representative_id INTEGER PRIMARY KEY,
  completeness_percent REAL NOT NULL,
  contamination_percent REAL NOT NULL,
  completeness_model TEXT NOT NULL,
  coding_density REAL NOT NULL,
  contig_n50_bp INTEGER NOT NULL,
  genome_size_bp INTEGER NOT NULL,
  gc_content REAL NOT NULL,
  total_coding_sequences INTEGER NOT NULL,
  total_contigs INTEGER NOT NULL,
  max_contig_length_bp INTEGER NOT NULL,
  FOREIGN KEY(representative_id) REFERENCES mag_representatives(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mag_abundances (
  dataset_version_id INTEGER NOT NULL,
  sample_id INTEGER NOT NULL,
  representative_id INTEGER NOT NULL,
  abundance_percent REAL NOT NULL,
  PRIMARY KEY(sample_id, representative_id),
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(sample_id) REFERENCES mag_samples(id) ON DELETE CASCADE,
  FOREIGN KEY(representative_id) REFERENCES mag_representatives(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mag_abundances_version_rep
  ON mag_abundances(dataset_version_id, representative_id);

CREATE TABLE IF NOT EXISTS mag_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version_id INTEGER NOT NULL,
  cluster_code TEXT NOT NULL,
  representative_id INTEGER NOT NULL,
  representative_source_sample_id INTEGER NOT NULL,
  member_count INTEGER NOT NULL,
  representative_completeness_percent REAL NOT NULL,
  representative_contamination_percent REAL NOT NULL,
  representative_score REAL NOT NULL,
  secondary_cluster_distance_threshold REAL NOT NULL,
  equivalent_ani_threshold REAL NOT NULL,
  cluster_method TEXT NOT NULL,
  comparison_algorithm TEXT NOT NULL,
  primary_cluster TEXT NOT NULL,
  UNIQUE(dataset_version_id, cluster_code),
  UNIQUE(dataset_version_id, representative_id),
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(representative_id) REFERENCES mag_representatives(id) ON DELETE CASCADE,
  FOREIGN KEY(representative_source_sample_id) REFERENCES mag_samples(id)
);

CREATE TABLE IF NOT EXISTS mag_cluster_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version_id INTEGER NOT NULL,
  cluster_id INTEGER NOT NULL,
  member_mag_code TEXT NOT NULL,
  source_sample_id INTEGER NOT NULL,
  is_representative INTEGER NOT NULL,
  member_to_rep_ani REAL NOT NULL,
  member_to_rep_alignment_coverage REAL NOT NULL,
  ani_direction TEXT NOT NULL,
  completeness_percent REAL NOT NULL,
  contamination_percent REAL NOT NULL,
  UNIQUE(dataset_version_id, member_mag_code),
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(cluster_id) REFERENCES mag_clusters(id) ON DELETE CASCADE,
  FOREIGN KEY(source_sample_id) REFERENCES mag_samples(id)
);

CREATE INDEX IF NOT EXISTS idx_mag_members_cluster_ani
  ON mag_cluster_members(cluster_id, member_to_rep_ani);

CREATE TABLE IF NOT EXISTS mag_species_crosswalk (
  representative_id INTEGER PRIMARY KEY,
  dataset_version_id INTEGER NOT NULL,
  gtdb_species TEXT,
  gtdb_classification TEXT,
  gtdb_reference_accession TEXT,
  gtdb_reference_source_field TEXT,
  gtdb_reference_ani REAL,
  gtdb_reference_af REAL,
  gtdb_classification_method TEXT,
  reference_ncbi_taxid TEXT,
  ncbi_species_taxid TEXT,
  ncbi_organism_name TEXT,
  ncbi_taxonomy TEXT,
  kraken_species_id TEXT,
  kraken_species_name TEXT,
  kraken_mpa_species_label TEXT,
  mapping_method TEXT,
  mapping_level TEXT,
  mapping_confidence TEXT,
  mapping_status TEXT NOT NULL,
  FOREIGN KEY(dataset_version_id) REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(representative_id) REFERENCES mag_representatives(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mag_crosswalk_version_status
  ON mag_species_crosswalk(dataset_version_id, mapping_status);
"""


MYSQL_MAG_SCHEMA = """
CREATE TABLE IF NOT EXISTS mag_dataset_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_key VARCHAR(32) NOT NULL,
  parent_version_key VARCHAR(32) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'importing',
  source_root VARCHAR(1024) NOT NULL,
  data_fingerprint CHAR(64) NOT NULL,
  manifest_sha256 CHAR(64) NOT NULL DEFAULT '',
  manifest_json JSON NULL,
  sample_count INT UNSIGNED NOT NULL,
  representative_mag_count INT UNSIGNED NOT NULL,
  member_mag_count INT UNSIGNED NOT NULL DEFAULT 0,
  cluster_count INT UNSIGNED NOT NULL DEFAULT 0,
  unit VARCHAR(16) NOT NULL DEFAULT '%%',
  group_field VARCHAR(32) NOT NULL DEFAULT 'disease',
  max_mapping_error DOUBLE NOT NULL DEFAULT 0,
  validation_json JSON NULL,
  imported_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mag_versions_key (version_key),
  UNIQUE KEY uk_mag_versions_fingerprint (data_fingerprint),
  KEY idx_mag_versions_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_package_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  relative_path VARCHAR(512) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mag_files_version_path (dataset_version_id, relative_path),
  CONSTRAINT fk_mag_files_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_samples (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  sample_code VARCHAR(191) NOT NULL,
  sample_name VARCHAR(255) NOT NULL DEFAULT '',
  accession VARCHAR(191) NOT NULL DEFAULT '',
  disease VARCHAR(16) NOT NULL,
  source_group VARCHAR(64) NOT NULL DEFAULT '',
  hpc_batch VARCHAR(64) NOT NULL,
  age DOUBLE NOT NULL,
  gender VARCHAR(16) NOT NULL,
  mapped_percent DOUBLE NOT NULL,
  unmapped_percent DOUBLE NOT NULL,
  r1_uri TEXT NOT NULL,
  r2_uri TEXT NOT NULL,
  coverm_label VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uk_mag_samples_version_code (dataset_version_id, sample_code),
  UNIQUE KEY uk_mag_samples_version_position (dataset_version_id, position),
  KEY idx_mag_samples_version_disease (dataset_version_id, disease),
  CONSTRAINT fk_mag_samples_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_representatives (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  mag_code VARCHAR(255) NOT NULL,
  length_bp BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mag_reps_version_code (dataset_version_id, mag_code),
  UNIQUE KEY uk_mag_reps_version_position (dataset_version_id, position),
  CONSTRAINT fk_mag_reps_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_taxonomy (
  representative_id BIGINT UNSIGNED NOT NULL,
  domain VARCHAR(128) NOT NULL DEFAULT '',
  phylum VARCHAR(128) NOT NULL DEFAULT '',
  class VARCHAR(128) NOT NULL DEFAULT '',
  tax_order VARCHAR(128) NOT NULL DEFAULT '',
  family VARCHAR(128) NOT NULL DEFAULT '',
  genus VARCHAR(191) NOT NULL DEFAULT '',
  species VARCHAR(255) NOT NULL DEFAULT '',
  classification_method VARCHAR(512) NOT NULL DEFAULT '',
  closest_reference VARCHAR(191) NULL,
  closest_ani DOUBLE NULL,
  closest_af DOUBLE NULL,
  msa_percent DOUBLE NULL,
  PRIMARY KEY (representative_id),
  KEY idx_mag_taxonomy_species (species),
  CONSTRAINT fk_mag_taxonomy_rep FOREIGN KEY (representative_id)
    REFERENCES mag_representatives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_quality (
  representative_id BIGINT UNSIGNED NOT NULL,
  completeness_percent DOUBLE NOT NULL,
  contamination_percent DOUBLE NOT NULL,
  completeness_model VARCHAR(128) NOT NULL,
  coding_density DOUBLE NOT NULL,
  contig_n50_bp BIGINT UNSIGNED NOT NULL,
  genome_size_bp BIGINT UNSIGNED NOT NULL,
  gc_content DOUBLE NOT NULL,
  total_coding_sequences BIGINT UNSIGNED NOT NULL,
  total_contigs BIGINT UNSIGNED NOT NULL,
  max_contig_length_bp BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (representative_id),
  KEY idx_mag_quality_reference (completeness_percent, contamination_percent),
  CONSTRAINT fk_mag_quality_rep FOREIGN KEY (representative_id)
    REFERENCES mag_representatives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_abundances (
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  sample_id BIGINT UNSIGNED NOT NULL,
  representative_id BIGINT UNSIGNED NOT NULL,
  abundance_percent DOUBLE NOT NULL,
  PRIMARY KEY (sample_id, representative_id),
  KEY idx_mag_abundances_version_rep (dataset_version_id, representative_id),
  CONSTRAINT fk_mag_abundances_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_abundances_sample FOREIGN KEY (sample_id)
    REFERENCES mag_samples(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_abundances_rep FOREIGN KEY (representative_id)
    REFERENCES mag_representatives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_clusters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  cluster_code VARCHAR(191) NOT NULL,
  representative_id BIGINT UNSIGNED NOT NULL,
  representative_source_sample_id BIGINT UNSIGNED NOT NULL,
  member_count INT UNSIGNED NOT NULL,
  representative_completeness_percent DOUBLE NOT NULL,
  representative_contamination_percent DOUBLE NOT NULL,
  representative_score DOUBLE NOT NULL,
  secondary_cluster_distance_threshold DOUBLE NOT NULL,
  equivalent_ani_threshold DOUBLE NOT NULL,
  cluster_method VARCHAR(64) NOT NULL,
  comparison_algorithm VARCHAR(64) NOT NULL,
  primary_cluster VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mag_clusters_version_code (dataset_version_id, cluster_code),
  UNIQUE KEY uk_mag_clusters_version_rep (dataset_version_id, representative_id),
  CONSTRAINT fk_mag_clusters_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_clusters_rep FOREIGN KEY (representative_id)
    REFERENCES mag_representatives(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_clusters_sample FOREIGN KEY (representative_source_sample_id)
    REFERENCES mag_samples(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_cluster_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  cluster_id BIGINT UNSIGNED NOT NULL,
  member_mag_code VARCHAR(255) NOT NULL,
  source_sample_id BIGINT UNSIGNED NOT NULL,
  is_representative BOOLEAN NOT NULL,
  member_to_rep_ani DOUBLE NOT NULL,
  member_to_rep_alignment_coverage DOUBLE NOT NULL,
  ani_direction VARCHAR(64) NOT NULL,
  completeness_percent DOUBLE NOT NULL,
  contamination_percent DOUBLE NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mag_members_version_code (dataset_version_id, member_mag_code),
  KEY idx_mag_members_cluster_ani (cluster_id, member_to_rep_ani),
  KEY idx_mag_members_source_sample (source_sample_id),
  CONSTRAINT fk_mag_members_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_members_cluster FOREIGN KEY (cluster_id)
    REFERENCES mag_clusters(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_members_sample FOREIGN KEY (source_sample_id)
    REFERENCES mag_samples(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mag_species_crosswalk (
  representative_id BIGINT UNSIGNED NOT NULL,
  dataset_version_id BIGINT UNSIGNED NOT NULL,
  gtdb_species VARCHAR(255) NULL,
  gtdb_classification TEXT NULL,
  gtdb_reference_accession VARCHAR(191) NULL,
  gtdb_reference_source_field VARCHAR(128) NULL,
  gtdb_reference_ani DOUBLE NULL,
  gtdb_reference_af DOUBLE NULL,
  gtdb_classification_method VARCHAR(512) NULL,
  reference_ncbi_taxid VARCHAR(64) NULL,
  ncbi_species_taxid VARCHAR(64) NULL,
  ncbi_organism_name VARCHAR(512) NULL,
  ncbi_taxonomy TEXT NULL,
  kraken_species_id VARCHAR(64) NULL,
  kraken_species_name VARCHAR(512) NULL,
  kraken_mpa_species_label VARCHAR(512) NULL,
  mapping_method VARCHAR(128) NULL,
  mapping_level VARCHAR(128) NULL,
  mapping_confidence VARCHAR(128) NULL,
  mapping_status VARCHAR(64) NOT NULL,
  PRIMARY KEY (representative_id),
  KEY idx_mag_crosswalk_version_status (dataset_version_id, mapping_status),
  KEY idx_mag_crosswalk_ncbi_taxid (ncbi_species_taxid),
  CONSTRAINT fk_mag_crosswalk_version FOREIGN KEY (dataset_version_id)
    REFERENCES mag_dataset_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_mag_crosswalk_rep FOREIGN KEY (representative_id)
    REFERENCES mag_representatives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""
