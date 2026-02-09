Frontend UX Architecture

Core Technology

Framework: Next.js 14 (App Router)

State Management: React Query (Server State) + React local state.

Data Fetching: API Route Handlers via typed client (lib/api.ts).

Auth: Auth.js v5 (Credentials, JWT strategy).

Key Components

1. The Editor (<PageEditor />)

Responsibility: Rendering and editing nodes.content.

Features:

Slash Menu: Inserts blocks.

2. The Headless Database (<DatabaseView />)

Responsibility: Rendering nodes that are children of a Database Node.

Tech: TanStack Table (Headless).

Logic:

Fetch database_definitions for the current parent.

Map JSON definition to Table Columns.

Bind Cell Inputs to nodes.properties JSONB.

Render specific UI cells (Select, Date, Person) based on type.

3. Global Search (<SearchDialog />)

Responsibility: Command palette and full-text search.

Logic:

Invoke /api/search with the user's query.

Navigate directly to node IDs from results.
