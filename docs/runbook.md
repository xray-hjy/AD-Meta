# AD-Meta Runbook

## Local Development

Create the backend virtual environment once:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Install frontend dependencies once:

```bash
cd frontend
npm install
```

Rebuild local storage from the tracked raw datasets:

```bash
npm run bootstrap:storage
```

This reads `backend/storage_manifest.json`, imports each file under
`backend/storage/raw/**`, creates `backend/storage/ad_meta.sqlite3`, and writes
chart JSON under `backend/storage/cache/`. The raw files are tracked in git;
SQLite and cache files are local runtime artifacts and are intentionally ignored.

Start both services from the project root:

```bash
npm run dev
```

The site is available at `http://127.0.0.1:3000`. The backend API is
available at `http://127.0.0.1:8000`.

Start the backend:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
cd frontend
npm start
```

The frontend dev build uses `http://127.0.0.1:8000` as the default API base.
For another API host, set `REACT_APP_API_BASE_URL`.

## Import A Dataset

Use the bootstrap command for a fresh clone or when you want to rebuild every
public dataset from the tracked raw files:

```bash
npm run bootstrap:storage
```

To add or refresh one dataset manually, run the import command from `backend/`.
After adding a public raw file that should be reproducible for collaborators,
also update `backend/storage_manifest.json`.

Example:

```bash
mkdir -p storage/raw/incoming

.venv/bin/python -m app.cli.import_dataset \
  --file storage/raw/incoming/AD_NC_species_abundance.xlsx \
  --slug ad-nc-species \
  --name "AD vs NC Species Abundance" \
  --description "Species abundance comparison between AD and NC groups."
```

Put the source `.xlsx`, `.csv`, or `.tsv` file in `storage/raw/incoming/`
before running the import command. Do not put raw data files under
`frontend/public/`.

The command reads `.xlsx`, `.csv`, or `.tsv`, validates the wide table format,
precomputes all chart JSON files, and marks the dataset as published.
The preferred sample identifier column is `sample_id`; legacy files with
`Sample` are still accepted.

Generated SQLite and chart cache files are stored under `backend/storage/` and
ignored by git. Only `backend/storage/raw/**` should be committed.

The import command also writes normalized long-table records:

- Taxonomy datasets populate `sample_info`, `taxon_anno`, and `species_abundance`.
- KO datasets populate `sample_info`, `ko_anno`, and `ko_abundance`.
- Species abundance stores non-zero values only; KO abundance keeps all values.
- Chart JSON remains precomputed under `backend/storage/cache/` for fast public API reads.

## Maintaining Chart Compute Modules

Chart calculation code is split by chart type under
`backend/app/compute/charts/`. When changing one visualization, edit the
matching module first:

- `species.py`: abundance comparison.
- `phylum.py`: phylum-level or KO composition.
- `boxplot.py`: abundance boxplots.
- `heatmap.py`: differential abundance heatmap and dendrogram metadata.
- `detection.py`: KO detection-rate heatmap.
- `lda.py`: KO LDA marker chart.
- `sunburst.py`: taxonomy hierarchy payload.
- `ordination.py`: PCA and PCoA payloads.
- `summary.py`: summary-card payload.

Shared import and serialization helpers live in `backend/app/compute/io.py`.
Input table normalization lives in `backend/app/compute/table.py`. Shared AD/NC
constants and feature metadata live in `backend/app/compute/common.py`.
Taxonomy naming helpers remain in `backend/app/compute/taxonomy.py` because
multiple charts use the same species naming rules.

After changing chart calculation logic, rebuild local cache JSON:

```bash
npm run bootstrap:storage
```

Then run the backend regression tests:

```bash
cd backend
.venv/bin/python -m unittest tests.test_precompute tests.test_dataset_service tests.test_heatmap_api tests.test_import_dataset tests.test_bootstrap_storage tests.test_normalized_import -v
```

If a response shape changes, update `docs/api.md`, frontend chart code, and
tests in the same change. Pure internal refactors should keep API payloads and
`COMPUTE_VERSION` unchanged.

## Database Mode

SQLite remains the default local development database:

```bash
export AD_META_DB_ENGINE=sqlite
export AD_META_DB_PATH=storage/ad_meta.sqlite3
```

To use MySQL 8.0+, create the database first:

```sql
CREATE DATABASE ad_meta
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

Then configure the backend before starting the API or running imports:

```bash
export AD_META_DB_ENGINE=mysql
export AD_META_MYSQL_HOST=127.0.0.1
export AD_META_MYSQL_PORT=3306
export AD_META_MYSQL_USER=root
export AD_META_MYSQL_PASSWORD='your-password'
export AD_META_MYSQL_DATABASE=ad_meta
```

`init_db()` creates the MySQL tables on startup/import. The schema keeps the
six scientific tables from the ER plan and adds application support tables for
dataset switching, chart caches, import jobs, KO annotations, and reference
study de-duplication. See `docs/database.md` for the table-level contract.

## Production-Style Docker Run

```bash
docker compose up --build
```

The site is served at:

```text
http://localhost:8080
```

The frontend container serves static files through Nginx. Requests under
`/api/` are proxied to the backend container.

## Public Data Contract

Keep `docs/api.md` updated whenever an API response changes. Frontend mock data,
backend responses, and chart components should all follow that document.
