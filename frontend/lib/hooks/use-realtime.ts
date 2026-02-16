"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Centrifuge } from "centrifuge";

/**
 * Connects to Centrifugo via WebSocket and invalidates React Query caches on events.
 * Replaces per-tab Postgres LISTEN with a single multiplexer.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const url = process.env.NEXT_PUBLIC_CENTRIFUGO_URL;
    if (!url) return;

    const centrifuge = new Centrifuge(url, {
      getToken: async () => {
        const res = await fetch("/api/centrifugo/token");
        const { token } = await res.json();
        return token;
      },
    });

    const taskSub = centrifuge.newSubscription("new_task");
    taskSub.on("publication", () => {
      queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
    });
    taskSub.subscribe();

    const msgSub = centrifuge.newSubscription("new_message");
    msgSub.on("publication", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    msgSub.subscribe();

    centrifuge.connect();

    return () => {
      centrifuge.disconnect();
    };
  }, [status, queryClient]);
}
