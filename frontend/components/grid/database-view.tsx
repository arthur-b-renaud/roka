"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type FilterFn,
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { CellRenderer } from "./cell-renderer";
import { AddColumnDialog } from "./add-column-dialog";
import { ColumnHeaderMenu } from "./column-header-menu";
import { TableToolbar } from "./table-toolbar";
import { ViewTabs } from "./view-tabs";
import type {
  DbNode,
  DbDatabaseDefinition,
  DbDatabaseView,
  SchemaColumn,
  ViewSort,
  ViewFilter,
  ViewConfig,
} from "@/lib/types/database";
import { viewConfigSchema } from "@/lib/types/database";

// ─── Custom filter function ─────────────────────────────────────────

const customFilter: FilterFn<DbNode> = (row, columnId, filterValue) => {
  const { operator, value } = filterValue as { operator: string; value?: unknown };
  const cellValue = row.getValue(columnId);

  // Empty/not-empty checks
  if (operator === "is_empty") return cellValue == null || cellValue === "";
  if (operator === "is_not_empty") return cellValue != null && cellValue !== "";
  if (operator === "is_true") return cellValue === true;
  if (operator === "is_false") return cellValue !== true;

  const strCell = String(cellValue ?? "").toLowerCase();
  const strVal = String(value ?? "").toLowerCase();

  switch (operator) {
    case "contains": return strCell.includes(strVal);
    case "does_not_contain": return !strCell.includes(strVal);
    case "is": return strCell === strVal;
    case "is_not": return strCell !== strVal;
    case "eq": return Number(cellValue) === Number(value);
    case "neq": return Number(cellValue) !== Number(value);
    case "gt": return Number(cellValue) > Number(value);
    case "lt": return Number(cellValue) < Number(value);
    case "gte": return Number(cellValue) >= Number(value);
    case "lte": return Number(cellValue) <= Number(value);
    case "is_before": return String(cellValue ?? "") < String(value ?? "");
    case "is_after": return String(cellValue ?? "") > String(value ?? "");
    default: return true;
  }
};

// ─── Sortable header cell ───────────────────────────────────────────

interface SortableHeaderCellProps {
  id: string;
  style?: React.CSSProperties;
  children: (props: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
  }) => React.ReactNode;
}

function SortableHeaderCell({ id, children, style }: SortableHeaderCellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const cellStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <th ref={setNodeRef} style={cellStyle} className="px-3 py-2 text-left">
      {children({ attributes, listeners })}
    </th>
  );
}

// ─── Main component ─────────────────────────────────────────────────

interface DatabaseViewProps {
  node: DbNode;
}

export function DatabaseView({ node }: DatabaseViewProps) {
  const router = useRouter();
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [showAddColumn, setShowAddColumn] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ─── Fetch schema ──────────────────────────────────────────────
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

  // ─── Fetch rows ────────────────────────────────────────────────
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

  // ─── Fetch views ───────────────────────────────────────────────
  const { data: views = [] } = useQuery<DbDatabaseView[]>({
    queryKey: ["db-views", node.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("database_views")
        .select("*")
        .eq("database_id", node.id)
        .order("sort_order", { ascending: true });
      if (error) {
        // Table might not exist yet -- gracefully return empty
        if (error.code === "42P01") return [];
        throw error;
      }
      // Parse view_config through Zod for defaults
      return (data ?? []).map((v) => ({
        ...v,
        view_config: viewConfigSchema.parse(v.view_config ?? {}),
      })) as DbDatabaseView[];
    },
  });

  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Auto-select first view, or create default if none
  useEffect(() => {
    if (views.length > 0 && !activeViewId) {
      setActiveViewId(views[0].id);
    }
  }, [views, activeViewId]);

  // Auto-create default view if none exist and we have a db def
  const hasTriedCreate = useRef(false);
  useEffect(() => {
    if (views.length === 0 && dbDef && !hasTriedCreate.current) {
      hasTriedCreate.current = true;
      supabase
        .from("database_views")
        .insert({ database_id: node.id, name: "Default view", view_config: {} })
        .select()
        .single()
        .then(({ data }) => {
          if (data) {
            queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
            setActiveViewId(data.id);
          }
        });
    }
  }, [views, dbDef, node.id, supabase, queryClient]);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );
  const viewConfig: ViewConfig = useMemo(
    () => activeView?.view_config ?? { sorts: [], filters: [], columnOrder: [], hiddenColumns: [] },
    [activeView]
  );

  const schemaColumns: SchemaColumn[] = useMemo(
    () => dbDef?.schema_config ?? [],
    [dbDef]
  );

  // Column order: view's columnOrder, or schema default
  const orderedSchemaColumns: SchemaColumn[] = useMemo(() => {
    if (viewConfig.columnOrder.length > 0) {
      const byKey = new Map(schemaColumns.map((c) => [c.key, c]));
      const ordered = viewConfig.columnOrder
        .map((k) => byKey.get(k))
        .filter((c): c is SchemaColumn => c != null);
      // Append any new columns not in the order
      const inOrder = new Set(viewConfig.columnOrder);
      for (const c of schemaColumns) {
        if (!inOrder.has(c.key)) ordered.push(c);
      }
      return ordered;
    }
    return schemaColumns;
  }, [schemaColumns, viewConfig.columnOrder]);

  // ─── View config state derived from active view ────────────────
  const sorting: SortingState = useMemo(
    () => viewConfig.sorts.map((s) => ({ id: s.columnKey, desc: s.direction === "desc" })),
    [viewConfig.sorts]
  );
  const columnFilters: ColumnFiltersState = useMemo(
    () =>
      viewConfig.filters.map((f) => ({
        id: f.columnKey,
        value: { operator: f.operator, value: f.value },
      })),
    [viewConfig.filters]
  );

  // ─── Debounced view config save ────────────────────────────────
  const saveViewConfig = useCallback(
    (config: Partial<ViewConfig>) => {
      if (!activeView) return;
      const newConfig = { ...viewConfig, ...config };
      // Optimistic update in cache
      queryClient.setQueryData<DbDatabaseView[]>(
        ["db-views", node.id],
        (old) =>
          (old ?? []).map((v) =>
            v.id === activeView.id
              ? { ...v, view_config: newConfig }
              : v
          )
      );
      // Debounced persist
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await supabase
          .from("database_views")
          .update({ view_config: newConfig })
          .eq("id", activeView.id);
      }, 500);
    },
    [activeView, viewConfig, supabase, queryClient, node.id]
  );

  const handleSortsChange = useCallback(
    (sorts: ViewSort[]) => saveViewConfig({ sorts }),
    [saveViewConfig]
  );

  const handleFiltersChange = useCallback(
    (filters: ViewFilter[]) => saveViewConfig({ filters }),
    [saveViewConfig]
  );

  // ─── Row mutations ─────────────────────────────────────────────

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
      if (navigate) router.push(`/workspace/${newRow.id}`);
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

  // ─── Schema mutations ──────────────────────────────────────────

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

  const renameColumn = useCallback(
    async (key: string, newName: string) => {
      if (!dbDef) return;
      const newSchema = dbDef.schema_config.map((c) =>
        c.key === key ? { ...c, name: newName } : c
      );
      await supabase
        .from("database_definitions")
        .update({ schema_config: newSchema })
        .eq("id", dbDef.id);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, supabase, queryClient, node.id]
  );

  const changeColumnType = useCallback(
    async (key: string, newType: SchemaColumn["type"], options?: string[]) => {
      if (!dbDef) return;
      const newSchema = dbDef.schema_config.map((c) =>
        c.key === key
          ? { ...c, type: newType, options: newType === "select" ? options : undefined }
          : c
      );
      await supabase
        .from("database_definitions")
        .update({ schema_config: newSchema })
        .eq("id", dbDef.id);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, supabase, queryClient, node.id]
  );

  const reorderColumns = useCallback(
    async (newOrder: string[]) => {
      if (!dbDef) return;
      const byKey = new Map(dbDef.schema_config.map((c) => [c.key, c]));
      const reordered = newOrder
        .map((k) => byKey.get(k))
        .filter((c): c is SchemaColumn => c != null);
      await supabase
        .from("database_definitions")
        .update({ schema_config: reordered })
        .eq("id", dbDef.id);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
      // Also persist to view
      saveViewConfig({ columnOrder: newOrder });
    },
    [dbDef, supabase, queryClient, node.id, saveViewConfig]
  );

  // ─── View CRUD ─────────────────────────────────────────────────

  const createView = useCallback(async () => {
    const { data } = await supabase
      .from("database_views")
      .insert({
        database_id: node.id,
        name: `View ${views.length + 1}`,
        view_config: {},
        sort_order: views.length,
      })
      .select()
      .single();
    if (data) {
      queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
      setActiveViewId(data.id);
    }
  }, [supabase, queryClient, node.id, views.length]);

  const renameView = useCallback(
    async (viewId: string, name: string) => {
      await supabase.from("database_views").update({ name }).eq("id", viewId);
      queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
    },
    [supabase, queryClient, node.id]
  );

  const duplicateView = useCallback(
    async (viewId: string) => {
      const source = views.find((v) => v.id === viewId);
      if (!source) return;
      const { data } = await supabase
        .from("database_views")
        .insert({
          database_id: node.id,
          name: `${source.name} (copy)`,
          view_config: source.view_config,
          sort_order: views.length,
        })
        .select()
        .single();
      if (data) {
        queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
        setActiveViewId(data.id);
      }
    },
    [supabase, queryClient, node.id, views]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) return;
      await supabase.from("database_views").delete().eq("id", viewId);
      queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
      if (activeViewId === viewId) {
        const remaining = views.filter((v) => v.id !== viewId);
        setActiveViewId(remaining[0]?.id ?? null);
      }
    },
    [supabase, queryClient, node.id, views, activeViewId]
  );

  // ─── Column DnD ────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const sortableIds = useMemo(
    () => orderedSchemaColumns.map((c) => c.key),
    [orderedSchemaColumns]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortableIds.indexOf(String(active.id));
      const newIndex = sortableIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = [...sortableIds];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, String(active.id));
      reorderColumns(newOrder);
    },
    [sortableIds, reorderColumns]
  );

  // ─── Column sort handler from header menu ──────────────────────

  const handleColumnSort = useCallback(
    (columnKey: string, direction: "asc" | "desc" | false) => {
      const currentSorts = viewConfig.sorts;
      if (direction === false) {
        handleSortsChange(currentSorts.filter((s) => s.columnKey !== columnKey));
      } else {
        const filtered = currentSorts.filter((s) => s.columnKey !== columnKey);
        handleSortsChange([...filtered, { columnKey, direction }]);
      }
    },
    [viewConfig.sorts, handleSortsChange]
  );

  // ─── TanStack column definitions ──────────────────────────────

  const columns: ColumnDef<DbNode>[] = useMemo(() => {
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
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover/title:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => router.push(`/workspace/${row.original.id}`)}
            aria-label="Open as page"
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ),
    };

    const schemaCols: ColumnDef<DbNode>[] = orderedSchemaColumns.map((col) => ({
      id: col.key,
      header: col.name, // Overridden by custom header render
      accessorFn: (row: DbNode) =>
        (row.properties as Record<string, unknown>)[col.key] ?? "",
      filterFn: customFilter,
      cell: ({ row }: { row: { original: DbNode } }) => (
        <CellRenderer
          type={col.type}
          value={(row.original.properties as Record<string, unknown>)[col.key]}
          options={col.options}
          onChange={(val) => handleCellUpdate(row.original.id, col.key, val)}
        />
      ),
    }));

    const actionsCol: ColumnDef<DbNode> = {
      id: "_actions",
      header: "",
      size: 40,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Row actions"
              className="rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
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
  }, [orderedSchemaColumns, handleCellUpdate, router, deleteRow]);

  // ─── TanStack Table ────────────────────────────────────────────

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const sorts: ViewSort[] = next.map((s) => ({
        columnKey: s.id,
        direction: s.desc ? "desc" : "asc",
      }));
      handleSortsChange(sorts);
    },
    onColumnFiltersChange: () => {
      // Filters are managed via toolbar, not TanStack's built-in
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    filterFns: { customFilter },
  });

  // Get sort state for a column
  const getColumnSortState = useCallback(
    (key: string): false | "asc" | "desc" => {
      const sort = viewConfig.sorts.find((s) => s.columnKey === key);
      return sort ? sort.direction : false;
    },
    [viewConfig.sorts]
  );

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* View tabs */}
      {views.length > 0 && (
        <ViewTabs
          views={views}
          activeViewId={activeViewId}
          onSelectView={setActiveViewId}
          onCreateView={createView}
          onRenameView={renameView}
          onDuplicateView={duplicateView}
          onDeleteView={deleteView}
        />
      )}

      {/* Toolbar */}
      <div className="py-1.5">
        <TableToolbar
          columns={schemaColumns}
          sorts={viewConfig.sorts}
          filters={viewConfig.filters}
          onSortsChange={handleSortsChange}
          onFiltersChange={handleFiltersChange}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full" aria-label={`${node.title} database`}>
            <caption className="sr-only">
              {node.title} database with {rows.length} row
              {rows.length !== 1 ? "s" : ""}
            </caption>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b bg-muted/50">
                  {/* Title header (not sortable via DnD) */}
                  <th
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    style={{ width: 280 }}
                  >
                    Name
                  </th>

                  {/* Schema column headers (sortable) */}
                  <SortableContext
                    items={sortableIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {orderedSchemaColumns.map((col) => (
                      <SortableHeaderCell key={col.key} id={col.key}>
                        {({ attributes, listeners }) => (
                          <ColumnHeaderMenu
                            column={col}
                            isSorted={getColumnSortState(col.key)}
                            onRename={(name) => renameColumn(col.key, name)}
                            onChangeType={(type, opts) => changeColumnType(col.key, type, opts)}
                            onSort={(dir) => handleColumnSort(col.key, dir)}
                            onDelete={() => removeColumn(col.key)}
                            dragAttributes={attributes}
                            dragListeners={listeners}
                          />
                        )}
                      </SortableHeaderCell>
                    ))}
                  </SortableContext>

                  {/* Actions header */}
                  <th className="w-10 px-2 py-2" />

                  {/* "+" add column */}
                  <th className="w-10 px-2 py-2">
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setShowAddColumn(true)}
                      aria-label="Add a property"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getFilteredRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={orderedSchemaColumns.length + 3}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    {rows.length === 0
                      ? "No rows yet. Click below to add one."
                      : "No rows match the current filters."}
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
        </DndContext>
      </div>

      {/* New row buttons */}
      <div className="flex items-center gap-2 pt-2">
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
          New & open
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
