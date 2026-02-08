"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AddColumnDialog } from "./add-column-dialog";
import { TableToolbar } from "./table-toolbar";
import { ViewTabs } from "./view-tabs";
import { TableView } from "./table-view";
import { BoardView } from "./board-view";
import type {
  DbNode,
  DbDatabaseDefinition,
  DbDatabaseView,
  SchemaColumn,
  ViewSort,
  ViewFilter,
  ViewConfig,
  ViewType,
} from "@/lib/types/database";
import { viewConfigSchema } from "@/lib/types/database";

interface DatabaseViewProps {
  node: DbNode;
}

export function DatabaseView({ node }: DatabaseViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAddColumn, setShowAddColumn] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Fetch schema
  const { data: dbDef } = useQuery<DbDatabaseDefinition>({
    queryKey: ["db-definition", node.id],
    queryFn: async () => {
      return api.databaseDefinitions.get(node.id);
    },
  });

  // Fetch rows
  const { data: rows = [] } = useQuery<DbNode[]>({
    queryKey: ["db-rows", node.id],
    queryFn: async () => {
      return api.nodes.list({
        parentId: node.id,
        type: "database_row",
        orderBy: "sort_order",
      });
    },
  });

  // Fetch views
  const { data: views = [] } = useQuery<DbDatabaseView[]>({
    queryKey: ["db-views", node.id],
    queryFn: async () => {
      const data = await api.databaseViews.list(node.id);
      return (data ?? []).map((v: Record<string, unknown>) => ({
        ...v,
        view_config: viewConfigSchema.parse(v.view_config ?? {}),
      })) as DbDatabaseView[];
    },
  });

  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    if (views.length > 0 && !activeViewId) {
      setActiveViewId(views[0].id);
    }
  }, [views, activeViewId]);

  // Auto-create default view if none exist
  const hasTriedCreate = useRef(false);
  useEffect(() => {
    if (views.length === 0 && dbDef && !hasTriedCreate.current) {
      hasTriedCreate.current = true;
      api.databaseViews
        .create({
          databaseId: node.id,
          name: "Table",
          viewConfig: { viewType: "table" },
        })
        .then((data: Record<string, unknown>) => {
          if (data) {
            queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
            setActiveViewId(data.id as string);
          }
        });
    }
  }, [views, dbDef, node.id, queryClient]);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );
  const viewConfig: ViewConfig = useMemo(
    () =>
      activeView?.view_config ?? {
        viewType: "table",
        sorts: [],
        filters: [],
        columnOrder: [],
        hiddenColumns: [],
      },
    [activeView]
  );

  const schemaColumns: SchemaColumn[] = useMemo(
    () => dbDef?.schema_config ?? [],
    [dbDef]
  );

  const orderedSchemaColumns: SchemaColumn[] = useMemo(() => {
    if (viewConfig.columnOrder.length > 0) {
      const byKey = new Map(schemaColumns.map((c) => [c.key, c]));
      const ordered = viewConfig.columnOrder
        .map((k) => byKey.get(k))
        .filter((c): c is SchemaColumn => c != null);
      const inOrder = new Set(viewConfig.columnOrder);
      for (const c of schemaColumns) {
        if (!inOrder.has(c.key)) ordered.push(c);
      }
      return ordered;
    }
    return schemaColumns;
  }, [schemaColumns, viewConfig.columnOrder]);

  // Debounced view config save
  const saveViewConfig = useCallback(
    (config: Partial<ViewConfig>) => {
      if (!activeView) return;
      const newConfig = { ...viewConfig, ...config };
      queryClient.setQueryData<DbDatabaseView[]>(
        ["db-views", node.id],
        (old) =>
          (old ?? []).map((v) =>
            v.id === activeView.id ? { ...v, view_config: newConfig } : v
          )
      );
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await api.databaseViews.update(activeView.id, { viewConfig: newConfig });
      }, 500);
    },
    [activeView, viewConfig, queryClient, node.id]
  );

  const handleSortsChange = useCallback(
    (sorts: ViewSort[]) => saveViewConfig({ sorts }),
    [saveViewConfig]
  );

  const handleFiltersChange = useCallback(
    (filters: ViewFilter[]) => saveViewConfig({ filters }),
    [saveViewConfig]
  );

  const handleGroupByChange = useCallback(
    (groupBy: string | undefined) => saveViewConfig({ groupBy }),
    [saveViewConfig]
  );

  // Row mutations
  const handleCellUpdate = useCallback(
    async (rowId: string, key: string, value: unknown) => {
      const currentRow = await api.nodes.get(rowId);
      const properties = {
        ...((currentRow?.properties as Record<string, unknown>) ?? {}),
        [key]: value,
      };
      await api.nodes.update(rowId, { properties });
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
    [queryClient, node.id]
  );

  const addRow = useMutation({
    mutationFn: async ({
      navigate = false,
      defaultProperties = {},
    }: {
      navigate?: boolean;
      defaultProperties?: Record<string, unknown>;
    }) => {
      const data = await api.nodes.create({
        parentId: node.id,
        type: "database_row",
        title: "",
        content: [],
        properties: defaultProperties,
      });
      return { node: data as DbNode, navigate };
    },
    onSuccess: ({ node: newRow, navigate }) => {
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
      if (navigate) router.push(`/workspace/${newRow.id}`);
    },
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      await api.nodes.delete(rowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["db-rows", node.id] });
    },
  });

  // Schema mutations
  const addColumn = useCallback(
    async (column: SchemaColumn) => {
      if (!dbDef) return;
      const newSchema = [...dbDef.schema_config, column];
      await api.databaseDefinitions.update(node.id, newSchema);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, queryClient, node.id]
  );

  const removeColumn = useCallback(
    async (key: string) => {
      if (!dbDef) return;
      const newSchema = dbDef.schema_config.filter((c) => c.key !== key);
      await api.databaseDefinitions.update(node.id, newSchema);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, queryClient, node.id]
  );

  const renameColumn = useCallback(
    async (key: string, newName: string) => {
      if (!dbDef) return;
      const newSchema = dbDef.schema_config.map((c) =>
        c.key === key ? { ...c, name: newName } : c
      );
      await api.databaseDefinitions.update(node.id, newSchema);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, queryClient, node.id]
  );

  const changeColumnType = useCallback(
    async (key: string, newType: SchemaColumn["type"], options?: string[]) => {
      if (!dbDef) return;
      const newSchema = dbDef.schema_config.map((c) =>
        c.key === key
          ? { ...c, type: newType, options: newType === "select" ? options : undefined }
          : c
      );
      await api.databaseDefinitions.update(node.id, newSchema);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
    },
    [dbDef, queryClient, node.id]
  );

  const reorderColumns = useCallback(
    async (newOrder: string[]) => {
      if (!dbDef) return;
      const byKey = new Map(dbDef.schema_config.map((c) => [c.key, c]));
      const reordered = newOrder
        .map((k) => byKey.get(k))
        .filter((c): c is SchemaColumn => c != null);
      await api.databaseDefinitions.update(node.id, reordered);
      queryClient.invalidateQueries({ queryKey: ["db-definition", node.id] });
      saveViewConfig({ columnOrder: newOrder });
    },
    [dbDef, queryClient, node.id, saveViewConfig]
  );

  // View CRUD
  const createView = useCallback(
    async (viewType: ViewType = "table") => {
      const selectCol = schemaColumns.find((c) => c.type === "select");
      const config: Partial<ViewConfig> = { viewType };
      if (viewType === "board" && selectCol) {
        config.groupBy = selectCol.key;
      }
      const name = viewType === "board" ? "Board view" : `View ${views.length + 1}`;
      const data = await api.databaseViews.create({
        databaseId: node.id,
        name,
        viewConfig: config,
        sortOrder: views.length,
      });
      if (data) {
        queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
        setActiveViewId(data.id);
      }
    },
    [queryClient, node.id, views.length, schemaColumns]
  );

  const renameView = useCallback(
    async (viewId: string, name: string) => {
      await api.databaseViews.update(viewId, { name });
      queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
    },
    [queryClient, node.id]
  );

  const duplicateView = useCallback(
    async (viewId: string) => {
      const source = views.find((v) => v.id === viewId);
      if (!source) return;
      const data = await api.databaseViews.create({
        databaseId: node.id,
        name: `${source.name} (copy)`,
        viewConfig: source.view_config as unknown as Record<string, unknown>,
        sortOrder: views.length,
      });
      if (data) {
        queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
        setActiveViewId(data.id);
      }
    },
    [queryClient, node.id, views]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) return;
      await api.databaseViews.delete(viewId);
      queryClient.invalidateQueries({ queryKey: ["db-views", node.id] });
      if (activeViewId === viewId) {
        const remaining = views.filter((v) => v.id !== viewId);
        setActiveViewId(remaining[0]?.id ?? null);
      }
    },
    [queryClient, node.id, views, activeViewId]
  );

  const currentViewType = viewConfig.viewType ?? "table";

  return (
    <div className="space-y-0">
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

      <div className="py-1.5">
        <TableToolbar
          columns={schemaColumns}
          sorts={viewConfig.sorts}
          filters={viewConfig.filters}
          onSortsChange={handleSortsChange}
          onFiltersChange={handleFiltersChange}
          viewType={currentViewType}
          groupBy={viewConfig.groupBy}
          onGroupByChange={handleGroupByChange}
        />
      </div>

      {currentViewType === "board" ? (
        <BoardView
          node={node}
          rows={rows}
          schemaColumns={schemaColumns}
          viewConfig={viewConfig}
          onCellUpdate={handleCellUpdate}
          onAddRow={(navigate, defaultProps) =>
            addRow.mutate({ navigate, defaultProperties: defaultProps })
          }
          onDeleteRow={(rowId) => deleteRow.mutate(rowId)}
        />
      ) : (
        <TableView
          node={node}
          rows={rows}
          orderedSchemaColumns={orderedSchemaColumns}
          viewConfig={viewConfig}
          onCellUpdate={handleCellUpdate}
          onSortsChange={handleSortsChange}
          onAddRow={(navigate) => addRow.mutate({ navigate })}
          onDeleteRow={(rowId) => deleteRow.mutate(rowId)}
          onRenameColumn={renameColumn}
          onChangeColumnType={changeColumnType}
          onRemoveColumn={removeColumn}
          onReorderColumns={reorderColumns}
          onShowAddColumn={() => setShowAddColumn(true)}
        />
      )}

      <AddColumnDialog
        open={showAddColumn}
        onOpenChange={setShowAddColumn}
        existingKeys={schemaColumns.map((c) => c.key)}
        onAdd={addColumn}
      />
    </div>
  );
}
