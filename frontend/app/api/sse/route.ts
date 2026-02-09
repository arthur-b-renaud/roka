/**
 * SSE endpoint — streams PostgreSQL LISTEN/NOTIFY events to the client.
 * Listens to 'new_task' channel (fired by trg_agent_tasks_notify trigger).
 * Each connected client gets its own pg connection for LISTEN.
 */

import { auth } from "@/lib/auth";
import { createListenConnection } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let listenConn: ReturnType<typeof createListenConnection> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(": connected\n\n"));

      try {
        listenConn = createListenConnection();

        // Listen to task changes
        await listenConn.listen("new_task", (payload) => {
          if (closed) return;
          const data = JSON.stringify({ channel: "new_task", payload });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        });

        // Listen to new messages (conversations)
        await listenConn.listen("new_message", (payload) => {
          if (closed) return;
          const data = JSON.stringify({ channel: "new_message", payload });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        });

        // Heartbeat every 30s to keep connection alive
        const heartbeat = setInterval(() => {
          if (closed) {
            clearInterval(heartbeat);
            return;
          }
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 30_000);
      } catch (err) {
        console.error("SSE listen error:", err);
        controller.close();
      }
    },
    async cancel() {
      closed = true;
      if (listenConn) {
        try {
          await listenConn.end();
        } catch {
          // Connection already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
