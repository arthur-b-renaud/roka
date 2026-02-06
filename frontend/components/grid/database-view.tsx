"use client";

import { useCallback, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CellRenderer } from "./cell-renderer";
import type { DbNode, DbDatabaseDefinition, SchemaColumn } from "@/lib/types/database";

interface DatabaseViewProps {
  node: DbNode;
}

export function DatabaseView({ node }: DatabaseViewProps) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  // Fetch database definition (schema)
  const { data: dbDef } = useQuery<DbDatabaseDefinition>({
    queryKey: ["db-definition", node.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("database_definitions")
        .select("*")
        .eq("node_id", node.id)
        .single();
      if (error) throw error;
      return data as DbDatabaseDefinition;
    },
  });

  // Fetch rows (child nodes of type database_row)
  const { data: rows = [] } = useQuery<DbNode[]>({
    queryKey: ["db-rows", node.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("parent_id", node.id)
        .eq("type", "database_row")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DbNode[];
    },
  });

  const schemaColumns: SchemaColumn[] = useMemo(
    () => dbDef?.schema_config ?? [],
    [dbDef]
  );

  // Stable cell-update function (avoids re-render loops)
  const handleCellUpdate = useCallback(
    async (rowId: string, key: string, value: unknown) => {
      // Fetch current row fresh to merge properties
      const { data: currentRow } = await supabase
        .from("nodes")
        .select("properties")
        .eq("id", rowId)
        .single();
      const properties = { ...(currentRow?.properties as Record<string, unknown> ?? {}), [key]: value };
      const { error } = await supabase
        .from("nodes")
        .update({ properties })
        .eq("id", rowId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
    [supabase, queryClient, node.id]
  );

  const handleTitleUpdate = useCallback(
    async (rowId: string, title: string) => {
      const { error } = await supabase
        .from("nodes")
        .update({ title })
        .eq("id", rowId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
    [supabase, queryClient, node.id]
  );

  // Add new row
  const addRow = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("nodes").insert({
        parent_id: node.id,
        owner_id: user.id,
        type: "database_row",
        title: "",
        content: [],
        properties: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
  });

  // Build TanStack columns from schema (stable deps)
  const columns: ColumnDef<DbNode>[] = useMemo(() => {
    const titleCol: ColumnDef<DbNode> = {
      id: "title",
      header: "Title",
      accessorFn: (row) => row.title,
      cell: ({ row }) => (
        <CellRenderer
          type="text"
          value={row.original.title}
          onChange={(val) => handleTitleUpdate(row.original.id, val as string)}
        />
      ),
    };

    const schemaCols: ColumnDef<DbNode>[] = schemaColumns.map((col) => ({
      id: col.key,
      header: col.name,
      accessorFn: (row: DbNode) =>
        (row.properties as Record<string, unknown>)[col.key] ?? "",
      cell: ({ row }: { row: { original: DbNode } }) => (
        <CellRenderer
          type={col.type}
          value={(row.original.properties as Record<string, unknown>)[col.key]}
          options={col.options}
          onChange={(val) => handleCellUpdate(row.original.id, col.key, val)}
        />
      ),
    }));

    return [titleCol, ...schemaCols];
  }, [schemaColumns, handleTitleUpdate, handleCellUpdate]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-left text-sm font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b transition-colors hover:bg-muted/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-1.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => addRow.mutate()}
      >
        <Plus className="h-4 w-4" />
        New row
      </Button>
    </div>
  );
}
