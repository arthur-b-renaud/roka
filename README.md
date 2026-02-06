# Roka -- Sovereign Agentic Workspace

A self-hosted knowledge workspace combining Notion-like editing with LangGraph agentic workflows. Built on Supabase + Next.js + FastAPI, deployable anywhere via Docker Compose.

## Architecture

```
User -> Next.js (ANON key, RLS) -> Supabase Kong -> PostgreSQL
                                                      ^
                                                      |
                    FastAPI + LangGraph (SERVICE_ROLE) -+-> LiteLLM -> OpenAI/Ollama/OpenRouter
```

**Sidecar Pattern**: Frontend and Backend don't communicate via HTTP. They share the database. Frontend writes `agent_tasks` rows; Backend polls and executes them.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/arthur-b-renaud/roka.git
cd roka

# 2. Configure
cp infra/.env.example infra/.env
# Edit infra/.env -- set your OPENAI_API_KEY and passwords

# 3. Launch
docker compose -f infra/docker-compose.yml up -d

# 4. Initialize database (first time only)
# Open Supabase Studio at http://localhost:8000
# Run database/init.sql in the SQL editor

# 5. Access
# Frontend:  http://localhost:3000
# Studio:    http://localhost:8000
# API:       http://localhost:8080
# Backend:   http://localhost:8100
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
| LLM Proxy  | LiteLLM                             |
| Database   | PostgreSQL 15 + pgvector + pg_trgm  |
| Auth       | Supabase Auth (GoTrue)              |
| Infra      | Docker Compose                      |

## Directory Structure

```
/
├── infra/                    # Docker Compose + config
│   ├── docker-compose.yml    # Main composition
│   ├── docker-compose.prod.yml  # Production overrides
│   ├── .env.example          # All configuration
│   ├── kong.yml              # API gateway config
│   ├── litellm-config.yaml   # LLM routing
│   └── backup/               # Backup/restore scripts
├── database/
│   └── init.sql              # Schema: tables, RLS, indexes, RPCs
├── frontend/                 # Next.js workspace UI
│   ├── app/                  # App Router pages
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
    │   └── services/         # Task runner (poller)
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

### Agent Workflows (Backend)
- **Summarize**: Fetch content -> LLM summarize -> write back to node properties
- **Smart Triage**: Classify -> extract entities/dates -> create linked child nodes
- **Task poller**: Background loop that atomically claims and executes pending tasks
- **Webhook ingestion**: External event intake with entity resolution

### Keyboard Shortcuts
| Shortcut | Action     |
| -------- | ---------- |
| Cmd+K    | Search     |
| Cmd+N    | New page   |

## Sovereignty Levers

All choices are environment variables:

- **LLM**: `LITELLM_MODEL=openai/gpt-4o` or `ollama/llama3` or `openrouter/anthropic/claude-3.5-sonnet`
- **Storage**: Supabase Storage (local or S3-compatible)
- **Database**: Full PostgreSQL access + Supabase Studio dashboard
- **Backup**: `pg_dump` script with optional S3 sync

## Production Deployment

```bash
# Build and run with production overrides (no Studio, built images, resource limits)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
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
