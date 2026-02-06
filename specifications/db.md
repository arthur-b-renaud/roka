Database Schema Specification

Design Pattern: The "Hybrid Core"

We utilize PostgreSQL's relational strengths for Identity/Time and its JSONB strengths for Content/Knowledge.

1. Zone A: The Fixed Core (Strict Relational)

Used for high-frequency queries, joins, and identity resolution.

entities (Identity)

Purpose: Canonical source of "Who".

Columns:

id (UUID, PK)

display_name (Text)

type (Enum: 'person', 'org', 'bot')

resolution_keys (JSONB): Stores arrays of emails, phones, handles. Indexed via GIN.

context_vector (Vector): Semantic embedding of the entity's bio.

communications (Signal)

Purpose: Immutable log of Inbound/Outbound signals.

Columns:

id (UUID, PK)

timestamp (Timestamptz)

channel (Enum: 'email', 'slack', 'sms')

direction (Enum: 'inbound', 'outbound')

from_entity_id (FK -> entities)

content_text (Text): Normalized body for RAG.

raw_payload (JSONB): The full original JSON from the provider.

2. Zone B: The Flexible Shell (Polymorphic)

Used for user-generated knowledge and application state.

nodes (Content)

Purpose: The atomic unit of the OS (Page, Task, Note, Image).

Columns:

id (UUID, PK)

parent_id (UUID, Self-Ref): Defines the Workspace Tree.

type (Text): 'page', 'database_row', 'image'.

content (JSONB): Stores the BlockNote editor state (Prosemirror JSON).

properties (JSONB): Stores user-defined fields (Status, Priority). GIN Indexed.

edges (Graph)

Purpose: Semantic links between Nodes and Entities.

Columns: source_id, target_id, type (e.g., 'MENTIONS', 'BLOCKS').

database_definitions (Meta)

Purpose: Defines the schema for UI Databases (e.g., "Tasks DB has a 'Status' column").

Columns: node_id (FK), schema_config (JSONB).

3. Zone C: Agent State

checkpoints: Stores serialized LangGraph state.

writes: Stores history of Agent modifications for audit trails.