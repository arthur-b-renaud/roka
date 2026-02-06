"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { Button } from "@/components/ui/button";
import { Plus, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CellRenderer } from "./cell-renderer";
import { AddColumnDialog } from "./add-column-dialog";
import type { DbNode, DbDatabaseDefinition, SchemaColumn } from "@/lib/types/database";

interface DatabaseViewProps {
  node: DbNode;
}

export function DatabaseView({ node }: DatabaseViewProps) {
  const router = useRouter();
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [showAddColumn, setShowAddColumn] = useState(false);

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

  // -- Mutations --

  const handleCellUpdate = useCallback(
    async (rowId: string, key: string, value: unknown) => {
      const { data: currentRow } = await supabase
        .from("nodes")
        .select("properties")
        .eq("id", rowId)
        .single();
      const properties = {
        ...(currentRow?.properties as Record<string, unknown> ?? {}),
        [key]: value,
      };
      await supabase.from("nodes").update({ properties }).eq("id", rowId);
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
    [supabase, queryClient, node.id]
  );

  const handleTitleUpdate = useCallback(
    async (rowId: string, title: string) => {
      await supabase.from("nodes").update({ title }).eq("id", rowId);
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
    [supabase, queryClient, node.id]
  );

  // Create new row and optionally navigate to it
  const addRow = useMutation({
    mutationFn: async (navigate: boolean = false) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("nodes")
        .insert({
          parent_id: node.id,
          owner_id: user.id,
          type: "database_row",
          title: "",
          content: [],
          properties: {},
        })
        .select()
        .single();
      if (error) throw error;
      return { node: data as DbNode, navigate };
    },
    onSuccess: ({ node: newRow, navigate }) => {
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
      if (navigate) {
        router.push(`/workspace/${newRow.id}`);
      }
    },
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      await supabase.from("nodes").delete().eq("id", rowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
  });

  // Add a new column to the database schema
  const addColumn = useCallback(
    async (column: SchemaColumn) => {
      if (!dbDef) return;
      const newSchema = [...dbDef.schema_config, column];
      await supabase
        .from("database_definitions")
        .update({ schema_config: newSchema })
        .eq("id", dbDef.id);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, supabase, queryClient, node.id]
  );

  const removeColumn = useCallback(
    async (key: string) => {
      if (!dbDef) return;
      const newSchema = dbDef.schema_config.filter((c) => c.key !== key);
      await supabase
        .from("database_definitions")
        .update({ schema_config: newSchema })
        .eq("id", dbDef.id);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, supabase, queryClient, node.id]
  );

  // -- Column definitions --

  const columns: ColumnDef<DbNode>[] = useMemo(() => {
    // Title column: clickable link to open row as page
    const titleCol: ColumnDef<DbNode> = {
      id: "title",
      header: "Name",
      size: 280,
      accessorFn: (row) => row.title,
      cell: ({ row }) => (
        <div className="group/title flex items-center gap-1">
          <button
            className="flex-1 text-left text-sm font-medium hover:underline"
            onClick={() => router.push(`/workspace/${row.original.id}`)}
          >
            {row.original.title || (
              <span className="text-muted-foreground">Untitled</span>
            )}
          </button>
          <button
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover/title:opacity-100"
            onClick={() => router.push(`/workspace/${row.original.id}`)}
            title="Open as page"
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ),
    };

    // Schema-driven property columns
    const schemaCols: ColumnDef<DbNode>[] = schemaColumns.map((col) => ({
      id: col.key,
      header: () => (
        <div className="group/header flex items-center gap-1">
          <span>{col.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-0.5 opacity-0 transition-opacity hover:bg-background group-hover/header:opacity-100">
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => removeColumn(col.key)}
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete property
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      accessorFn: (row: DbNode) =>
        (row.properties as Record<string, unknown>)[col.key] ?? "",
      cell: ({ row }: { row: { original: DbNode } }) => (
        <CellRenderer
          type={col.type}
          value={(row.original.properties as Record<string, unknown>)[col.key]}
          options={col.options}
          onChange={(val) =>
            handleCellUpdate(row.original.id, col.key, val)
          }
        />
      ),
    }));

    // Row actions column
    const actionsCol: ColumnDef<DbNode> = {
      id: "_actions",
      header: "",
      size: 40,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => router.push(`/workspace/${row.original.id}`)}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open as page
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => deleteRow.mutate(row.original.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };

    return [titleCol, ...schemaCols, actionsCol];
  }, [schemaColumns, handleTitleUpdate, handleCellUpdate, removeColumn, router, deleteRow]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    style={header.column.getSize() ? { width: header.column.getSize() } : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
                {/* "+" header to add column */}
                <th className="w-10 px-2 py-2">
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    onClick={() => setShowAddColumn(true)}
                    title="Add a property"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No rows yet. Click below to add one.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="group border-b transition-colors hover:bg-muted/30"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New row buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => addRow.mutate(false)}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => addRow.mutate(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New &amp; open
        </Button>
      </div>

      {/* Add column dialog */}
      <AddColumnDialog
        open={showAddColumn}
        onOpenChange={setShowAddColumn}
        existingKeys={schemaColumns.map((c) => c.key)}
        onAdd={addColumn}
      />
    </div>
  );
}
