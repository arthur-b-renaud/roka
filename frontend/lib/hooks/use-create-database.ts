"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "./use-current-user";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { nodeUrl } from "@/lib/slug";
import type { DbNode, ViewConfig } from "@/lib/types/database";

const DEFAULT_VIEW_CONFIG: ViewConfig = {
  viewType: "table",
  sorts: [],
  filters: [],
  columnOrder: [],
  hiddenColumns: [],
};

/**
 * Creates a brand-new database node with its definition and default view.
 */
export function useCreateDatabase() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");

      // 1. Insert the database node
      const node = await api.nodes.create({
        type: "database",
        title: "Untitled Database",
        content: [],
        properties: {},
      });

      // 2. Insert database_definitions (empty schema)
      await api.databaseDefinitions.create(node.id, []);

      // 3. Insert default "Table" view
      await api.databaseViews.create({
        databaseId: node.id,
        name: "Table",
        viewConfig: DEFAULT_VIEW_CONFIG,
        sortOrder: 0,
      });

      return node as DbNode;
    },
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      router.push(nodeUrl(node.title, node.id));
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to create database", "error");
    },
  });
}

/**
 * Converts an existing page node into a database.
 */
export function useConvertToDatabase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (nodeId: string) => {
      // 1. Update node type and clear content
      await api.nodes.update(nodeId, { type: "database", content: [] });

      // 2. Insert database_definitions (empty schema)
      await api.databaseDefinitions.create(nodeId, []);

      // 3. Insert default "Table" view
      await api.databaseViews.create({
        databaseId: nodeId,
        name: "Table",
        viewConfig: DEFAULT_VIEW_CONFIG,
        sortOrder: 0,
      });

      return nodeId;
    },
    onSuccess: (nodeId) => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["node", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["breadcrumbs"] });
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to convert to database", "error");
    },
  });
}
