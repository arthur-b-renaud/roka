"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { CellRenderer } from "./cell-renderer";
import { Separator } from "@/components/ui/separator";
import type { DbNode, DbDatabaseDefinition, SchemaColumn } from "@/lib/types/database";

interface RowPropertiesPanelProps {
  node: DbNode; // the database_row node
}

/**
 * Displays editable property fields for a database_row, based on the
 * parent database's schema_config. Shown at the top of a row page,
 * just like Notion shows properties above the page editor.
 */
export function RowPropertiesPanel({ node }: RowPropertiesPanelProps) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  // Fetch parent database's schema
  const { data: dbDef } = useQuery<DbDatabaseDefinition | null>({
    queryKey: ["db-definition", node.parent_id],
    queryFn: async () => {
      if (!node.parent_id) return null;
      const { data, error } = await supabase
        .from("database_definitions")
        .select("*")
        .eq("node_id", node.parent_id)
        .single();
      if (error) return null;
      return data as DbDatabaseDefinition;
    },
    enabled: !!node.parent_id,
  });

  const schema: SchemaColumn[] = dbDef?.schema_config ?? [];

  const handlePropertyChange = useCallback(
    async (key: string, value: unknown) => {
      const properties = {
        ...(node.properties as Record<string, unknown>),
        [key]: value,
      };
      await supabase
        .from("nodes")
        .update({ properties })
        .eq("id", node.id);
      // Invalidate both the current node and the parent's row list
      queryClient.invalidateQueries({ queryKey: ["node", node.id] });
      if (node.parent_id) {
        queryClient.invalidateQueries({ queryKey: ["db-rows", node.parent_id] });
      }
    },
    [supabase, queryClient, node]
  );

  if (schema.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="space-y-2.5 rounded-lg border bg-muted/20 px-4 py-3">
        {schema.map((col) => (
          <div key={col.key} className="flex items-center gap-4">
            <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
              {col.name}
            </span>
            <div className="flex-1">
              <CellRenderer
                type={col.type}
                value={
                  (node.properties as Record<string, unknown>)[col.key]
                }
                options={col.options}
                onChange={(val) => handlePropertyChange(col.key, val)}
              />
            </div>
          </div>
        ))}
      </div>
      <Separator className="mt-6" />
    </div>
  );
}
