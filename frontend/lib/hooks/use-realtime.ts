"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

/**
 * Connects to /api/sse and invalidates React Query caches on events.
 * Uses PostgreSQL LISTEN/NOTIFY via SSE for realtime updates.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const { status } = useSession();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    const es = new EventSource("/api/sse");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.channel === "new_task") {
          queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
        }

        if (data.channel === "new_message") {
          // Invalidate conversation messages to trigger refetch
          queryClient.invalidateQueries({ queryKey: ["messages"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      } catch {
        // Ignore parse errors (heartbeats etc)
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [status, queryClient]);
}
