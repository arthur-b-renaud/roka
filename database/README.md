# Database Layout (Dev Baseline)

This project now uses a **reset baseline migration model** for development.

## Source of truth

- `init.sql` bootstraps a fresh database.
- `migrations/001_baseline.sql` applies the current application schema extensions.
- `init.sql` includes `migrations/001_baseline.sql` during container bootstrap.

## Legacy migrations

- Older incremental migrations are archived in `migrations/legacy/`.
- They are kept only for historical reference and are **not** part of the active migration chain.

## Active migration policy

- Add new migration files in `database/migrations/` only when introducing new schema changes.
- Keep `init.sql` and active migrations consistent so fresh environments and existing environments match.

## Dev reset flow

From repo root:

```bash
cd infra
docker compose down -v
docker compose up -d db
cd ..
make migrate
```

This ensures a clean database from the current baseline.
