# Database Layout

Reset baseline migration model for development.

## Structure

```
database/
├── init.sql                 # Bootstraps fresh DB (extensions, roles, core schema)
├── migrations/
│   ├── 001_baseline.sql     # Active: credentials, tools, conversations, telemetry
│   └── legacy/              # Archived incremental migrations (historical reference only)
└── scripts/
    └── fix-blocknote-content.sql  # One-off fix for corrupted editor content
```

## Source of truth

- `init.sql` creates extensions (`uuid-ossp`, `vector`, `pg_trgm`), the `roka_backend` role, core tables, triggers, and search RPCs.
- `migrations/001_baseline.sql` adds the credential vault, tool definitions, conversations, agent definitions, and telemetry tables.
- Docker entrypoint runs `init.sql` on first boot. The baseline migration is applied via `make migrate`.

## Migration policy

- Add new numbered SQL files in `migrations/` for schema changes.
- Keep `init.sql` + active migrations consistent so fresh and existing environments match.
- Legacy migrations in `migrations/legacy/` are kept for reference only.

## Dev reset

```bash
make reset
```

Or manually:

```bash
cd infra && docker compose down -v && docker compose up -d db
make migrate
```
