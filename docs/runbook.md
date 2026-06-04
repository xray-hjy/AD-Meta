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

Run the import command from `backend/`:

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

Generated files are stored under `backend/storage/`, which is ignored by git.

The import command also writes normalized long-table records:

- Taxonomy datasets populate `sample_info`, `taxon_anno`, and `species_abundance`.
- KO datasets populate `sample_info`, `ko_anno`, and `ko_abundance`.
- Species abundance stores non-zero values only; KO abundance keeps all values.
- Chart JSON remains precomputed under `backend/storage/cache/` for fast public API reads.

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
