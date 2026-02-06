# roka

Sovereign Agentic OS (Project Roka)

A self-hosted operating system where State, Interface, and Logic share a single brain.

1. The Vision

Current productivity tools are fragmented: your database is in Notion, your files are in Drive, and your AI agents are trapped in chat windows.

Sovereign Agentic OS unifies these three domains into a single, self-hosted state machine:

State (The Database): A single source of truth (PostgreSQL) that stores business data, personal knowledge, and vector embeddings side-by-side.

Interface (The Face): A "Headless" Notion-like interface where UI components are rendered dynamically based on database schemas.

Logic (The Agent): A first-class "Ghost User" that operates on the database asynchronously—triaging email, synthesizing knowledge, and maintaining system hygiene 24/7.

Core Philosophy:

Sovereignty: Zero dependency on proprietary SaaS for critical path operations.

Data-First: The database schema is the API. The UI and Agents are merely views and modifiers of that schema.

Passive Intelligence: Agents act on data events (Webhooks/Triggers), not just user chat requests.

2. The "Trinity" Architecture

The system is designed as a modular monolith deployed via Docker Compose, wrapping a standard Supabase stack.

🏛️ Infrastructure (The Body)

Runtime: Docker Compose.

Base Layer: Official Supabase images (PostgreSQL 15+, GoTrue, Kong, Storage).

Strategy: "Sidecar" architecture. We do not fork Supabase; we run alongside it within the same internal network.

🧠 Backend (The Brain)

Runtime: Python 3.11.

Framework: FastAPI + LangGraph.

Role: The orchestration engine. It connects directly to the database to perform vector search, RAG, and state management. It handles "messy" ingestion (parsing PDFs, emails) that Node.js struggles with.

🖥️ Frontend (The Face)

Runtime: Next.js 14 (App Router).

Components: BlockNote (Notion-like Editor) + TanStack Table (Headless Databases).

Role: A unified interface for interacting with the "Hybrid Schema" (Structured Entities + Unstructured Notes).

3. Technology Stack

Domain

Technology

Purpose

Database

PostgreSQL 15+

The "God Store." Handles Relational, JSONB, and Vector data.

Extensions

pgvector, pg_trgm

Semantic search and fuzzy text matching.

Backend

Python / FastAPI

High-performance API for Agents and Ingestion.

Agent

LangGraph

Stateful, cyclic agent orchestration (The "Cognitive Graph").

Frontend

Next.js / React

Server-side rendering and dynamic routing.

Editor

BlockNote

Block-based rich text editing (Prosemirror wrapper).

Auth

Supabase Auth

secure JWT management (GoTrue).

4. Directory Structure

/
├── .cursorrules             # AI Coding Guidelines & Context
├── infra/                   # Infrastructure Configuration
│   ├── docker-compose.yml   # Main composition (Supabase + App)
│   └── .env.example         # Connection strings
├── backend/                 # Python Agent Service
│   ├── app/                 # FastAPI Application
│   └── graph/               # LangGraph Workflow Definitions
├── frontend/                # Next.js Application
│   ├── app/                 # App Router
│   └── components/          # BlockNote & TanStack Components
└── database/                # Schema Definitions
    └── init.sql             # The Hybrid Schema (Fixed + Flexible)


5. Quick Start

Prerequisites

Docker & Docker Compose

Git

Deployment

Bootstrap Infrastructure:

# Clone the repo
git clone [https://github.com/your-username/sovereign-os.git](https://github.com/your-username/sovereign-os.git)
cd sovereign-os

# Setup Environment
cp infra/.env.example infra/.env
# Edit .env with your LLM API Keys (OpenAI/Anthropic)


Launch the Stack:

docker compose -f infra/docker-compose.yml up -d


Initialize the Brain:

Access Supabase Studio at http://localhost:8000.

Navigate to the SQL Editor.

Run the contents of database/init.sql to create the Hybrid Schema.

Access:

Frontend: http://localhost:3000

API: http://localhost:8080

Studio: http://localhost:8000