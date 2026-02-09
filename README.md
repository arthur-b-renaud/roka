<p align="center">
  <h1 align="center">Roka</h1>
  <p align="center">
    <strong>Open-source, self-hosted Notion alternative with built-in AI agents.</strong>
  </p>
  <p align="center">
    Own your data. Own your AI. Deploy anywhere.
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> &middot;
    <a href="#deploy-to-a-vps">Deploy</a> &middot;
    <a href="#features">Features</a> &middot;
    <a href="#architecture">Architecture</a>
  </p>
  <p align="center">
    <a href="https://github.com/arthur-b-renaud/roka/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
    <a href="https://github.com/arthur-b-renaud/roka"><img src="https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white" alt="Docker"></a>
    <a href="https://github.com/arthur-b-renaud/roka"><img src="https://img.shields.io/badge/AI_Agents-LangGraph-FF6F00" alt="LangGraph"></a>
    <a href="https://github.com/arthur-b-renaud/roka"><img src="https://img.shields.io/badge/BYO_LLM-OpenAI%20%7C%20Ollama%20%7C%20OpenRouter-7C3AED" alt="BYO LLM"></a>
  </p>
</p>

---

## Why Roka?

Most "AI-powered" productivity tools are SaaS black boxes. Your notes, your documents, your company data -- all sitting on someone else's servers, processed by models you don't control.

**Roka is the opposite.** A Notion-like workspace where:

- **You own the infrastructure** -- runs on your own server via Docker Compose
- **You choose the AI** -- bring your own LLM (OpenAI, Ollama for local, OpenRouter, or any provider)
- **AI agents work autonomously** -- summarize, triage, classify, and extract from your content
- **Everything stays in your database** -- PostgreSQL with full-text search, no external dependencies
- **No vendor lock-in** -- every component is MIT/Apache-licensed and replaceable

One command to deploy. Zero lock-in.

## Quick Start

```bash
git clone https://github.com/arthur-b-renaud/roka.git
cd roka
make up
# Open http://localhost:3000
```

That's it. The setup wizard walks you through creating your account and configuring your LLM provider.

**Requirements:** Docker and Docker Compose.

## Features

### Workspace
- **Rich text editor** -- BlockNote-powered with auto-save
- **Database views** -- Notion-style tables with dynamic columns and properties
- **Page tree** -- Hierarchical sidebar with drag-and-drop organization
- **Global search** -- Full-text + fuzzy search (Cmd+K) powered by PostgreSQL
- **Setup wizard** -- First-run onboarding: account creation + LLM configuration

### AI Agents
- **Summarize** -- Extract key points from any page, written back as structured properties
- **Smart Triage** -- Classify content, extract entities and dates, auto-create linked sub-pages
- **Background processing** -- Tasks execute asynchronously via a polling + LISTEN/NOTIFY system
- **Graceful degradation** -- Workspace works fully without AI; agent features activate when LLM is configured

### Sovereignty
- **BYO LLM** -- Configure from the UI: OpenAI, Ollama (100% local), OpenRouter, or any litellm-compatible provider
- **Self-hosted auth** -- Auth.js v5 (MIT-licensed), credentials-based, no third-party dependency
- **Full database ownership** -- PostgreSQL 16 with pgvector, pg_trgm, direct access via any SQL client
- **Realtime** -- Native SSE via PostgreSQL LISTEN/NOTIFY (no external message broker)
- **Backup/Restore** -- `pg_dump` scripts with optional S3 sync

## Architecture

```
Browser -> Next.js (Auth.js JWT) -> API Routes -> PostgreSQL 16
                                                        ^
                                                        |
             FastAPI + LangGraph (roka_backend role) ---+---> litellm -> OpenAI / Ollama / OpenRouter
                                                        |
                                                app_settings (LLM config in DB)
```

**The Sidecar Pattern:** Frontend and Backend never talk to each other directly. They share the database. The frontend writes `agent_tasks` rows; the backend polls and executes them. This makes the system simple, debuggable, and resilient -- if the agent crashes, the workspace keeps working.

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn UI |
| Editor | BlockNote |
| Data Grid | TanStack Table (headless) |
| State | React Query |
| Auth | Auth.js v5 (Credentials, JWT, Drizzle adapter) |
| ORM | Drizzle ORM + postgres.js |
| Backend | FastAPI, Python 3.11, Pydantic v2 |
| Agent | LangGraph (stateful workflows) |
| LLM | litellm (direct calls, no middleware) |
| Database | PostgreSQL 16 + pgvector + pg_trgm |
| Realtime | SSE via PostgreSQL LISTEN/NOTIFY |
| Infra | Docker Compose (3 services), Caddy (production HTTPS) |

## Deploy to a VPS

One command. Installs Docker if needed, generates secrets, sets up HTTPS via Caddy.

```bash
# With a domain (auto-HTTPS via Let's Encrypt)
curl -sSL https://raw.githubusercontent.com/arthur-b-renaud/roka/main/install.sh | sudo bash -s -- --domain roka.example.com

# Without a domain (auto-detects public IP, HTTP only)
curl -sSL https://raw.githubusercontent.com/arthur-b-renaud/roka/main/install.sh | sudo bash
```

**Minimum specs:** Ubuntu 22.04+ / Debian 12+, 2 GB RAM, 2 vCPU. Point your domain's DNS A record to the server before running with `--domain`.

The installer:
- Installs Docker + Compose if missing
- Clones to `/opt/roka` (override with `--dir`)
- Generates all secrets automatically
- Configures Caddy reverse proxy + Let's Encrypt
- Sets up UFW firewall (ports 22, 80, 443 only)
- Starts the full stack in production mode

## Project Structure

```
roka/
├── frontend/              Next.js workspace UI
│   ├── app/               App Router (setup, auth, workspace, API routes)
│   ├── components/        Editor, grid, sidebar, UI primitives
│   └── lib/               Auth, Drizzle ORM, React Query hooks, types
├── backend/               FastAPI agent service
│   ├── app/               Routes, services, config
│   └── graph/workflows/   LangGraph workflows (summarize, triage)
├── database/
│   └── init.sql           Schema, triggers, search RPCs
├── infra/                 Docker Compose, setup scripts, backups
└── install.sh             One-liner VPS installer
```

## LLM Configuration

Configure from **Settings** in the UI after setup. Stored in the database, not in env vars.

| Provider | Models | API Key |
| -------- | ------ | ------- |
| OpenAI | `gpt-4o`, `gpt-4o-mini`, etc. | Required |
| Ollama | `llama3`, `mistral`, etc. | Not needed (local) |
| OpenRouter | `anthropic/claude-3.5-sonnet`, etc. | Required |

For Ollama in Docker, set the API Base URL to `http://host.docker.internal:11434`.

## Commands

```bash
make up           # Start (auto-generates secrets on first run)
make down         # Stop
make logs         # Tail logs
make prod         # Production build (Caddy, built images, no Studio)
make setup        # Regenerate secrets manually
make fix-content  # Fix corrupted BlockNote content (if text appears vertically)
```

## Backup & Restore

```bash
# Backup
POSTGRES_PASSWORD=<see infra/.env> ./infra/backup/backup.sh

# Restore
POSTGRES_PASSWORD=<see infra/.env> ./infra/backup/restore.sh ./backup.sql.gz
```

## Troubleshooting

### Text appears vertically (one character per line)

This happens when BlockNote content gets corrupted with individual characters as separate blocks. To fix:

```bash
make fix-content
```

Then refresh your browser. The script combines fragmented text blocks back into proper paragraphs.

## Roadmap

- [ ] Live collaboration (Yjs / Hocuspocus)
- [ ] Agent workflow visualizer (React Flow)
- [ ] Semantic search with pgvector embeddings
- [ ] Board / Kanban views
- [ ] File uploads and attachments
- [ ] Mobile responsive layout
- [ ] Multi-user roles and permissions

## Contributing

Contributions welcome. Open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE) -- Arthur RENAUD
