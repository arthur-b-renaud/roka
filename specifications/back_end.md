Agent Backend Specification

Core Technology

Runtime: Python 3.11

Framework: FastAPI (HTTP Layer)

Orchestration: LangGraph (State Machine)

Functional Modules

1. The Ingestion Engine (Stateless)

Role: Normalization & Identity Resolution.

Trigger: Webhook from External Provider (e.g., SendGrid, Twilio) or Database trigger.

Process:

Parse: Convert vendor-specific JSON to Communication schema.

Resolve: Check entities table. If email matches resolution_keys, link ID. Else, create Entity.

Persist: Write to communications table.

Broadcast: Fire event to trigger the Cognitive Graph.

2. The Cognitive Graph (Stateful)

Role: Triage, Contextualization, and Action.

Architecture: Async DAG (Directed Acyclic Graph) managed by LangGraph.

Standard Workflow:

Node 1: Classify. (LLM: "Is this spam, a task, or a notification?")

Node 2: Extract. (NER: Extract Dates, Deadlines, Entities).

Node 3: Rag. (Vector Search: Find related Nodes or Entities).

Node 4: Synthesize. (LLM: Generate summary or suggested reply).

Node 5: Act. (DB: Create a Node of type 'task', or update Entity metadata).

3. The Vector Engine

Role: Semantic Search provider.

Tech: langchain-postgres vector store wrapper.

Operations:

upsert_node(text): Chunk and embed content when a Node is saved.

query(text): Hybrid search (Keyword + Vector) for RAG.