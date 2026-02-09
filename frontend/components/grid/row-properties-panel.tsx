"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CellRenderer } from "./cell-renderer";
import { AddColumnDialog } from "./add-column-dialog";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";
import type { DbNode, DbDatabaseDefinition, SchemaColumn } from "@/lib/types/database";

interface RowPropertiesPanelProps {
  node: DbNode;
}

export function RowPropertiesPanel({ node }: RowPropertiesPanelProps) {
  const queryClient = useQueryClient();
  const [showAddColumn, setShowAddColumn] = useState(false);

  const { data: dbDef } = useQuery<DbDatabaseDefinition | null>({
    queryKey: ["db-definition", node.parentId],
    queryFn: async () => {
      if (!node.parentId) return null;
      return api.databaseDefinitions.get(node.parentId);
    },
    enabled: !!node.parentId,
  });

  const schema: SchemaColumn[] = dbDef?.schemaConfig ?? [];

  const handlePropertyChange = useCallback(
    async (key: string, value: unknown) => {
      const properties = {
        ...(node.properties as Record<string, unknown>),
        [key]: value,
      };
      await api.nodes.update(node.id, { properties });
      queryClient.invalidateQueries({ queryKey: ["node", node.id] });
      if (node.parentId) {
        queryClient.invalidateQueries({ queryKey: ["db-rows", node.parentId] });
      }
    },
    [queryClient, node]
  );

  const handleAddColumn = useCallback(
    async (column: SchemaColumn) => {
      if (!dbDef || !node.parentId) return;
      const newSchema = [...dbDef.schemaConfig, column];
      await api.databaseDefinitions.update(node.parentId, newSchema);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.parentId] });
    },
    [dbDef, queryClient, node.parentId]
  );

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

        <button
          type="button"
          onClick={() => setShowAddColumn(true)}
          className="flex items-center gap-1.5 rounded px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a property
        </button>
      </div>
      <Separator className="mt-6" />

      <AddColumnDialog
        open={showAddColumn}
        onOpenChange={setShowAddColumn}
        existingKeys={schema.map((c) => c.key)}
        onAdd={handleAddColumn}
      />
    </div>
  );
}
