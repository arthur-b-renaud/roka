# Roka -- Sovereign Agentic Workspace

A self-hosted knowledge workspace combining Notion-like editing with LangGraph agentic workflows. Built on Supabase + Next.js + FastAPI, deployable anywhere via Docker Compose.

## Architecture

```
User -> Next.js (ANON key, RLS) -> Supabase Kong -> PostgreSQL
                                                      ^
                                                      |
                    FastAPI + LangGraph (SERVICE_ROLE) -+-> litellm lib -> OpenAI/Ollama/OpenRouter
                                                      |
                                          app_settings (LLM config in DB)
```

**Sidecar Pattern**: Frontend and Backend don't communicate via HTTP. They share the database. Frontend writes `agent_tasks` rows; Backend polls and executes them.

**LLM config lives in the database**: provider, model, and API key are stored in the `app_settings` table and configurable from the UI. No env vars needed for LLM setup.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/arthur-b-renaud/roka.git
cd roka

# 2. Launch (automatically runs setup if needed)
make up

# 3. Open http://localhost:3000
# The setup wizard will guide you through:
#   - Creating your account
#   - Configuring your LLM provider (OpenAI / Ollama / OpenRouter)
```

## Technology Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Frontend   | Next.js 14, React, Tailwind, Shadcn |
| Editor     | BlockNote                           |
| Data Grid  | TanStack Table                      |
| State      | React Query + Supabase Client       |
| Backend    | FastAPI, Python 3.11                |
| Agent      | LangGraph                           |
| LLM        | litellm (Python lib, direct calls)  |
| Database   | PostgreSQL 15 + pgvector + pg_trgm  |
| Auth       | Supabase Auth (GoTrue)              |
| Infra      | Docker Compose                      |

## Directory Structure

```
/
├── infra/                    # Docker Compose + config
│   ├── docker-compose.yml    # Main composition
│   ├── docker-compose.prod.yml  # Production overrides
│   ├── .env.example          # Reference (setup.sh generates .env)
│   ├── setup.sh              # Zero-config bootstrap script
│   ├── kong.yml              # API gateway config
│   └── backup/               # Backup/restore scripts
├── database/
│   └── init.sql              # Schema: tables, RLS, indexes, RPCs
├── frontend/                 # Next.js workspace UI
│   ├── app/                  # App Router pages
│   │   ├── setup/            # First-run onboarding wizard
│   │   ├── auth/             # Login/signup
│   │   └── workspace/        # Main workspace
│   ├── components/           # UI components
│   │   ├── editor/           # BlockNote editor
│   │   ├── grid/             # TanStack Table database views
│   │   ├── sidebar/          # Tree + search
│   │   └── ui/               # Shadcn primitives
│   └── lib/                  # Supabase clients, types, hooks
└── backend/                  # FastAPI agent service
    ├── app/                  # FastAPI application
    │   ├── routes/           # Webhook endpoints
    │   └── services/         # Task runner + LLM settings
    └── graph/
        └── workflows/        # LangGraph workflows
            ├── summarize.py  # Content summarization
            └── triage.py     # Smart classify + extract
```

## Features

### Workspace (Frontend)
- **Page editor**: BlockNote rich text with debounced auto-save
- **Database views**: TanStack Table with dynamic columns from schema config
- **Sidebar tree**: Recursive page tree with lazy-loaded children
- **Global search**: Full-text search (Cmd+K) via PostgreSQL tsvector + trigram
- **Auth**: Supabase Auth with login/signup and protected routes
- **Dashboard**: Recent pages, pinned pages, agent task status
- **Setup wizard**: First-run onboarding (account creation + LLM config)

### Agent Workflows (Backend)
- **Summarize**: Fetch content -> LLM summarize -> write back to node properties
- **Smart Triage**: Classify -> extract entities/dates -> create linked child nodes
- **Task poller**: Background loop that atomically claims and executes pending tasks
- **Webhook ingestion**: External event intake with entity resolution
- **Webhook auth**: If `WEBHOOK_SECRET` is set, requests must include `X-Roka-Webhook-Secret`
- **Graceful degradation**: Agent features disabled until LLM is configured

### Keyboard Shortcuts
| Shortcut | Action     |
| -------- | ---------- |
| Cmd+K    | Search     |
| Cmd+N    | New page   |

## Sovereignty Levers

LLM provider is configurable from the **Settings** page in the UI:

- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, etc.
- **Ollama**: `llama3`, `mistral`, etc. (local, no API key needed)
- **OpenRouter**: `anthropic/claude-3.5-sonnet`, etc.

Other sovereignty controls:

- **Storage**: Supabase Storage (local or S3-compatible)
- **Database**: Full PostgreSQL access + Supabase Studio dashboard
- **Backup**: `pg_dump` script with optional S3 sync

## Deploy to a VPS

One command to deploy on any Ubuntu/Debian VPS. Installs Docker if needed, sets up HTTPS via Caddy.

```bash
# With a domain (auto-HTTPS via Let's Encrypt)
curl -sSL https://raw.githubusercontent.com/arthur-b-renaud/roka/main/install.sh | sudo bash -s -- --domain roka.example.com

# Without a domain (auto-detects public IP, HTTP only)
curl -sSL https://raw.githubusercontent.com/arthur-b-renaud/roka/main/install.sh | sudo bash
```

**Requirements**: Ubuntu 22.04+ or Debian 12+ VPS, 2 GB RAM / 2 vCPU minimum. Point your domain's DNS A record to the server IP before running with `--domain`. The script configures UFW to only allow ports 22, 80, and 443.

The script clones to `/opt/roka` by default (override with `--dir /your/path`).

## Local Production Build

```bash
# Build and run with production overrides (no Studio, built images, resource limits)
make prod
```

## Backup & Restore

```bash
# Backup
POSTGRES_PASSWORD=your-password ./infra/backup/backup.sh

# Restore
POSTGRES_PASSWORD=your-password ./infra/backup/restore.sh /tmp/roka-backups/roka_20260206_030000.sql.gz
```

## Not in v1 (Planned for v2)

- Live collaboration (Yjs/Hocuspocus)
- Agent visualizer (React Flow)
- Vector/semantic search (pgvector embeddings)
- Board/kanban views
- File upload/attachment UI
- Mobile responsive layout
- Admin roles / permission system
