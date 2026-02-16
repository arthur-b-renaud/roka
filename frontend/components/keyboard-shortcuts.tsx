"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { nodeUrl } from "@/lib/slug";
import type { DbNode } from "@/lib/types/database";

/**
 * Global keyboard shortcuts. Mount once in workspace layout.
 * - Cmd+K: Search (handled in SearchDialog)
 * - Cmd+N: New page
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const createPage = useMutation({
    mutationFn: async () => {
      return api.nodes.create({
        type: "page",
        title: "Untitled",
        content: [],
        properties: {},
      }) as Promise<DbNode>;
    },
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      router.push(nodeUrl(node.title, node.id));
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
