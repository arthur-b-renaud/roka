"use client";

import { useCallback, useMemo } from "react";
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
import { nodeUrl } from "@/lib/slug";
import { CellRenderer } from "./cell-renderer";
import { ColumnHeaderMenu } from "./column-header-menu";
import type {
  DbNode,
  SchemaColumn,
  ViewSort,
  ViewConfig,
} from "@/lib/types/database";

// ─── Custom filter function ─────────────────────────────────────────

const customFilter: FilterFn<DbNode> = (row, columnId, filterValue) => {
  const { operator, value } = filterValue as { operator: string; value?: unknown };
  const cellValue = row.getValue(columnId);

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

// ─── Props ──────────────────────────────────────────────────────────

export interface TableViewProps {
  node: DbNode;
  rows: DbNode[];
  orderedSchemaColumns: SchemaColumn[];
  viewConfig: ViewConfig;
  onCellUpdate: (rowId: string, key: string, value: unknown) => void;
  onSortsChange: (sorts: ViewSort[]) => void;
  onAddRow: (navigate: boolean) => void;
  onDeleteRow: (rowId: string) => void;
  onRenameColumn: (key: string, name: string) => void;
  onChangeColumnType: (key: string, type: SchemaColumn["type"], opts?: string[]) => void;
  onRemoveColumn: (key: string) => void;
  onReorderColumns: (newOrder: string[]) => void;
  onShowAddColumn: () => void;
}

export function TableView({
  node,
  rows,
  orderedSchemaColumns,
  viewConfig,
  onCellUpdate,
  onSortsChange,
  onAddRow,
  onDeleteRow,
  onRenameColumn,
  onChangeColumnType,
  onRemoveColumn,
  onReorderColumns,
  onShowAddColumn,
}: TableViewProps) {
  const router = useRouter();

  // ─── Sorting / Filtering state from view config ────────────────
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

  const handleColumnSort = useCallback(
    (columnKey: string, direction: "asc" | "desc" | false) => {
      const currentSorts = viewConfig.sorts;
      if (direction === false) {
        onSortsChange(currentSorts.filter((s) => s.columnKey !== columnKey));
      } else {
        const filtered = currentSorts.filter((s) => s.columnKey !== columnKey);
        onSortsChange([...filtered, { columnKey, direction }]);
      }
    },
    [viewConfig.sorts, onSortsChange]
  );

  const getColumnSortState = useCallback(
    (key: string): false | "asc" | "desc" => {
      const sort = viewConfig.sorts.find((s) => s.columnKey === key);
      return sort ? sort.direction : false;
    },
    [viewConfig.sorts]
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
      onReorderColumns(newOrder);
    },
    [sortableIds, onReorderColumns]
  );

  // ─── TanStack column defs ─────────────────────────────────────
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
            onClick={() => router.push(nodeUrl(row.original.title, row.original.id))}
          >
            {row.original.title || (
              <span className="text-muted-foreground">Untitled</span>
            )}
          </button>
          <button
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover/title:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => router.push(nodeUrl(row.original.title, row.original.id))}
            aria-label="Open as page"
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ),
    };

    const schemaCols: ColumnDef<DbNode>[] = orderedSchemaColumns.map((col) => ({
      id: col.key,
      header: col.name,
      accessorFn: (row: DbNode) =>
        (row.properties as Record<string, unknown>)[col.key] ?? "",
      filterFn: customFilter,
      cell: ({ row }: { row: { original: DbNode } }) => (
        <CellRenderer
          type={col.type}
          value={(row.original.properties as Record<string, unknown>)[col.key]}
          options={col.options}
          onChange={(val) => onCellUpdate(row.original.id, col.key, val)}
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
              onClick={() => router.push(nodeUrl(row.original.title, row.original.id))}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open as page
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDeleteRow(row.original.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };

    return [titleCol, ...schemaCols, actionsCol];
  }, [orderedSchemaColumns, onCellUpdate, router, onDeleteRow]);

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
      onSortsChange(sorts);
    },
    onColumnFiltersChange: () => {},
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    filterFns: { customFilter },
  });

  return (
    <>
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
                  <th
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    style={{ width: 280 }}
                  >
                    Name
                  </th>

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
                            onRename={(name) => onRenameColumn(col.key, name)}
                            onChangeType={(type, opts) => onChangeColumnType(col.key, type, opts)}
                            onSort={(dir) => handleColumnSort(col.key, dir)}
                            onDelete={() => onRemoveColumn(col.key)}
                            dragAttributes={attributes}
                            dragListeners={listeners}
                          />
                        )}
                      </SortableHeaderCell>
                    ))}
                  </SortableContext>

                  <th className="w-10 px-2 py-2" />
                  <th className="w-10 px-2 py-2">
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={onShowAddColumn}
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
          onClick={() => onAddRow(false)}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onAddRow(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          New & open
        </Button>
      </div>
    </>
  );
}
