Frontend UX Architecture

Core Technology

Framework: Next.js 14 (App Router)

State Management: React Query (Server State) + Zustand (Client State).

Data Fetching: Supabase Client (RLS-enabled).

Key Components

1. The Polymorphic Editor (<BlockNoteWrapper />)

Responsibility: Rendering and editing nodes.content.

Features:

Slash Menu: Inserts blocks.

Mention Plugin: Triggers @ search against entities table.

AI Plugin: Highlights text -> Sends to Backend -> Streams diff back.

2. The Headless Database (<SmartGrid />)

Responsibility: Rendering nodes that are children of a Database Node.

Tech: TanStack Table (Headless).

Logic:

Fetch database_definitions for the current parent.

Map JSON definition to Table Columns.

Bind Cell Inputs to nodes.properties JSONB.

Render specific UI cells (Select, Date, Person) based on type.

3. The Agent Observer (<GraphVisualizer />)

Responsibility: Visualizing the Agent's thought process.

Tech: React Flow (XYFlow).

Logic:

Fetch execution history from checkpoints.

Map steps to Graph Nodes.

Highlight the active path.

Show Input/Output state in a side panel.