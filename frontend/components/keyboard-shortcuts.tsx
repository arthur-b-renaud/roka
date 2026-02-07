"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { DbNode } from "@/lib/types/database";

/**
 * Global keyboard shortcuts. Mount once in workspace layout.
 * - Cmd+K: Search (handled in SearchDialog)
 * - Cmd+N: New page
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const createPage = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("nodes")
        .insert({
          owner_id: user.id,
          type: "page",
          title: "Untitled",
          content: [],
          properties: {},
        })
        .select()
        .single();
      if (error) throw error;
      return data as DbNode;
    },
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      router.push(`/workspace/${node.id}`);
    },
  });

  // Stable ref to avoid re-registering listener every render
  const createPageRef = useRef(createPage);
  createPageRef.current = createPage;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createPageRef.current.mutate();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
