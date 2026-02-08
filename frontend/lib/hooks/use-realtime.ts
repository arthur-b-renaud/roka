"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

/**
 * Connects to /api/sse and invalidates React Query caches on events.
 * Replaces Supabase Realtime subscriptions + polling.
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
          // Invalidate agent tasks to trigger refetch
          queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
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
