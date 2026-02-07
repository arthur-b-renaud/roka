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

Node 3: Synthesize. (LLM: Generate summary or suggested reply).

Node 4: Act. (DB: Create a Node of type 'task', or update Entity metadata).