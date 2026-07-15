# AD-Meta Runbook

## Local Development

Create the backend virtual environment once. On macOS/Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

On Windows PowerShell:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Install frontend dependencies once:

```bash
cd frontend
npm install
```

Make sure the locally installed MySQL server is running, then verify it:

```bash
mysqladmin ping -h 127.0.0.1 -P 3306 -uroot -p
```

Copy `.env.example` to `.env` and set the local MySQL password. The backend
loads this file automatically, and `.env` is ignored by git.

Upgrade the schema with Alembic, then migrate the existing SQLite data once into the empty MySQL
database:

```bash
npm run migrate
npm run migrate:sqlite-to-mysql
```

The migration preserves primary keys and foreign-key relationships and refuses
to write when any target application table already contains data. If this is a
fresh clone without `backend/storage/ad_meta.sqlite3`, rebuild MySQL from the
tracked raw datasets instead:

```bash
npm run bootstrap:storage
```

This reads `backend/storage_manifest.json`, imports each file under
`backend/storage/raw/**`, writes normalized records to MySQL, and writes chart
JSON under `backend/storage/cache/`. Run it again after pulling changes that
update `COMPUTE_VERSION` or chart precomputation logic.

Start the backend and frontend in two terminals:

```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

On Windows PowerShell, use:

```powershell
# Terminal 1
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2
cd frontend
$env:BROWSER='none'
$env:HOST='127.0.0.1'
$env:PORT='3000'
npm start
```

The site is available at `http://127.0.0.1:3000`. The backend API is
available at `http://127.0.0.1:8000`, and its OpenAPI page is at
`http://127.0.0.1:8000/docs`.

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

Vite proxies `/api` to `http://127.0.0.1:8000` in development. For another API
host, set `VITE_API_BASE_URL`.

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
  --description "Species abundance comparison between AD and NC groups." \
  --abundance-scale unknown \
  --missing-value-policy error
```

Put the source `.xlsx`, `.csv`, or `.tsv` file in `storage/raw/incoming/`
before running the import command. Do not put raw data files under
`frontend/public/`.

The command reads `.xlsx`, `.csv`, or `.tsv`, validates the wide table format,
precomputes all chart JSON files, and atomically publishes an immutable revision.
The preferred sample identifier column is `sample_id`; legacy files with
`Sample` are still accepted.

Generated chart cache files are stored under `backend/storage/` and ignored by
git. Database records are stored by the locally installed MySQL server. Only
`backend/storage/raw/**` should be committed.

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
- `lda.py`: compatibility module for exploratory KO differential features (Mann-Whitney U, BH-FDR and rank-biserial effect size); it is not LEfSe/LDA.
- `taxonomy/`: canonical taxonomy hierarchy, pruning, colors, and chart projections.
- `sunburst.py` and `taxonomy_hierarchy.py`: thin compatibility imports for historical code paths; new taxonomy work belongs in `taxonomy/`.
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
AD_META_DB_ENGINE=sqlite .venv/bin/python -m unittest tests.test_precompute tests.test_dataset_service tests.test_heatmap_api tests.test_import_dataset tests.test_bootstrap_storage tests.test_normalized_import -v
```

The root verification and real-browser gates are:

```bash
npm run verify
npm --prefix frontend exec -- playwright install chromium
npm run test:e2e
```

The E2E command uses a temporary SQLite database and storage root. It covers
deep links, dataset switching, all four taxonomy modes, heatmap lightbox/export,
and axe WCAG A/AA checks without modifying the configured MySQL database.

If a response shape changes, update `docs/reference/api.md`, frontend chart code, and
tests in the same change. Pure internal refactors should keep API payloads and
`COMPUTE_VERSION` unchanged.

## Database Mode

MySQL is the default for local development, Docker, and production-style runs.
The built-in defaults match the MySQL service in `docker-compose.yml`:

```bash
export AD_META_DB_ENGINE=mysql
export AD_META_MYSQL_HOST=127.0.0.1
export AD_META_MYSQL_PORT=3306
export AD_META_MYSQL_USER=root
export AD_META_MYSQL_PASSWORD='your-local-password'
export AD_META_MYSQL_DATABASE=ad_meta
```

For an externally managed MySQL 8.0+ server, create the database first:

```sql
CREATE DATABASE ad_meta
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

Alembic upgrades the MySQL schema during FastAPI lifespan startup. The schema keeps the
six scientific tables from the ER plan and adds application support tables for
dataset switching, chart caches, import jobs, KO annotations, and reference
study de-duplication. See `docs/reference/database.md` for the table-level contract.

SQLite can still be selected explicitly for isolated tests or migration checks:

```bash
export AD_META_DB_ENGINE=sqlite
export AD_META_DB_PATH=storage/ad_meta.sqlite3
```

## Production-Style Docker Run

Compose starts a health-checked MySQL 8.4 service and an internal-only R worker by default.
The backend, worker and Nginx containers run as non-root with read-only root filesystems.

```bash
docker compose up --build
```

The site is served at:

```text
http://localhost:8080
```

The frontend container serves static files through Nginx. Requests under
`/api/` are proxied to the backend container.

Use `docker compose --profile external-mysql up backend-external stats-worker`
for an externally managed MySQL host. Production mode rejects a blank password
or the MySQL root account.

## Public Data Contract

Keep `docs/reference/api.md` updated whenever an API response changes. Frontend mock data,
backend responses, and chart components should all follow that document.
