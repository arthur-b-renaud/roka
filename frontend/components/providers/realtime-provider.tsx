"use client";

import { useRealtime } from "@/lib/hooks/use-realtime";
import type { ReactNode } from "react";

/**
 * Single place for Centrifugo realtime connection in workspace.
 * Mount once in workspace layout; removes duplicate clients from page + ChatPanel.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  useRealtime();
  return <>{children}</>;
}
