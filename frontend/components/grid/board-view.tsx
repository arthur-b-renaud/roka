"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, MoreHorizontal, ExternalLink, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { nodeUrl } from "@/lib/slug";
import { getSelectColor, getSelectColorForValue } from "./cell-renderer";
import type {
  DbNode,
  SchemaColumn,
  ViewConfig,
} from "@/lib/types/database";

// ─── Types ───────────────────────────────────────────────────────────

interface BoardViewProps {
  node: DbNode;
  rows: DbNode[];
  schemaColumns: SchemaColumn[];
  viewConfig: ViewConfig;
  onCellUpdate: (rowId: string, key: string, value: unknown) => void;
  onAddRow: (navigate: boolean, defaultProperties?: Record<string, unknown>) => void;
  onDeleteRow: (rowId: string) => void;
}

// ─── Filter helper (mirrors customFilter from table-view) ────────────

function matchesFilter(cellValue: unknown, operator: string, value: unknown): boolean {
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
}

function applyFilters(rows: DbNode[], viewConfig: ViewConfig): DbNode[] {
  let filtered = rows;
  for (const f of viewConfig.filters) {
    filtered = filtered.filter((row) => {
      const val = (row.properties as Record<string, unknown>)[f.columnKey];
      return matchesFilter(val, f.operator, f.value);
    });
  }
  return filtered;
}

function applySorts(rows: DbNode[], viewConfig: ViewConfig, schemaColumns: SchemaColumn[]): DbNode[] {
  if (viewConfig.sorts.length === 0) return rows;
  const colTypeMap = new Map(schemaColumns.map((c) => [c.key, c.type]));
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const s of viewConfig.sorts) {
      const aRaw = (a.properties as Record<string, unknown>)[s.columnKey];
      const bRaw = (b.properties as Record<string, unknown>)[s.columnKey];
      const colType = colTypeMap.get(s.columnKey);
      let cmp: number;
      if (colType === "number") {
        cmp = (Number(aRaw) || 0) - (Number(bRaw) || 0);
      } else {
        cmp = String(aRaw ?? "").localeCompare(String(bRaw ?? ""));
      }
      if (cmp !== 0) return s.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}

// ─── Main component ─────────────────────────────────────────────────

export function BoardView({
  node,
  rows,
  schemaColumns,
  viewConfig,
  onCellUpdate,
  onAddRow,
  onDeleteRow,
}: BoardViewProps) {
  const router = useRouter();
  const groupByKey = viewConfig.groupBy ?? "";
  const groupByColumn = groupByKey ? schemaColumns.find((c) => c.key === groupByKey) : undefined;
  const options = groupByColumn?.options ?? [];

  // Apply filters and sorts
  const processedRows = useMemo(() => {
    const filtered = applyFilters(rows, viewConfig);
    return applySorts(filtered, viewConfig, schemaColumns);
  }, [rows, viewConfig, schemaColumns]);

  // Group rows by the groupBy column value
  const groupedRows = useMemo(() => {
    const groups: Record<string, DbNode[]> = {};
    // Init groups for each option + uncategorized
    for (const opt of options) {
      groups[opt] = [];
    }
    groups["__uncategorized__"] = [];

    for (const row of processedRows) {
      const val = groupByKey
        ? String((row.properties as Record<string, unknown>)[groupByKey] ?? "")
        : "";
      if (val && options.includes(val)) {
        groups[val].push(row);
      } else {
        groups["__uncategorized__"].push(row);
      }
    }
    return groups;
  }, [processedRows, groupByKey, options]);

  // Column order: options first, then uncategorized if non-empty
  const columnKeys = useMemo(() => {
    const keys = [...options];
    if (groupedRows["__uncategorized__"]?.length > 0) {
      keys.push("__uncategorized__");
    }
    return keys;
  }, [options, groupedRows]);

  // ─── DnD state ─────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRow = useMemo(
    () => processedRows.find((r) => r.id === activeId) ?? null,
    [processedRows, activeId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || !groupByKey) return;

      const rowId = String(active.id);
      // Determine target column: over.id could be a column key or another card id
      let targetColumn: string | null = null;

      // Check if dropped on a column droppable
      if (columnKeys.includes(String(over.id))) {
        targetColumn = String(over.id);
      } else {
        // Dropped on a card -- find which column that card belongs to
        for (const [col, colRows] of Object.entries(groupedRows)) {
          if (colRows.some((r) => r.id === String(over.id))) {
            targetColumn = col;
            break;
          }
        }
      }

      if (targetColumn && targetColumn !== "__uncategorized__") {
        // Get current value
        const row = processedRows.find((r) => r.id === rowId);
        const currentVal = row
          ? String((row.properties as Record<string, unknown>)[groupByKey] ?? "")
          : "";
        if (currentVal !== targetColumn) {
          onCellUpdate(rowId, groupByKey, targetColumn);
        }
      } else if (targetColumn === "__uncategorized__") {
        onCellUpdate(rowId, groupByKey, "");
      }
    },
    [groupByKey, columnKeys, groupedRows, processedRows, onCellUpdate]
  );

  // Show fallback if no groupBy column
  if (!groupByColumn) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-16 text-sm text-muted-foreground">
        Select a &quot;Group by&quot; property (select type) in the toolbar to use the board view.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columnKeys.map((colKey) => {
          const colRows = groupedRows[colKey] ?? [];
          const isUncategorized = colKey === "__uncategorized__";
          const color = isUncategorized
            ? { bg: "bg-gray-100 dark:bg-gray-800/40", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" }
            : getSelectColor(options.indexOf(colKey));

          return (
            <BoardColumn
              key={colKey}
              columnKey={colKey}
              label={isUncategorized ? "No status" : colKey}
              color={color}
              rows={colRows}
              groupByKey={groupByKey}
              options={options}
              schemaColumns={schemaColumns}
              onAddRow={(navigate) => {
                const defaultProps = isUncategorized
                  ? {}
                  : { [groupByKey]: colKey };
                onAddRow(navigate, defaultProps);
              }}
              onDeleteRow={onDeleteRow}
              onNavigate={(row) => router.push(nodeUrl(row.title, row.id))}
            />
          );
        })}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeRow ? (
          <BoardCard
            row={activeRow}
            schemaColumns={schemaColumns}
            groupByKey={groupByKey}
            options={options}
            isDragOverlay
            onNavigate={() => {}}
            onDelete={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Board Column ────────────────────────────────────────────────────

interface BoardColumnProps {
  columnKey: string;
  label: string;
  color: { bg: string; text: string; dot: string };
  rows: DbNode[];
  groupByKey: string;
  options: string[];
  schemaColumns: SchemaColumn[];
  onAddRow: (navigate: boolean) => void;
  onDeleteRow: (rowId: string) => void;
  onNavigate: (row: DbNode) => void;
}

function BoardColumn({
  columnKey,
  label,
  color,
  rows,
  groupByKey,
  options,
  schemaColumns,
  onAddRow,
  onDeleteRow,
  onNavigate,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 min-w-[18rem] shrink-0 flex-col rounded-lg transition-colors ${
        isOver ? "bg-accent/40" : "bg-muted/30"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
        <span className="text-sm font-medium">{label}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {rows.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex min-h-[2rem] flex-1 flex-col gap-1.5 px-2 pb-2">
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {rows.map((row) => (
            <SortableBoardCard
              key={row.id}
              row={row}
              schemaColumns={schemaColumns}
              groupByKey={groupByKey}
              options={options}
              onNavigate={onNavigate}
              onDelete={onDeleteRow}
            />
          ))}
        </SortableContext>

        {/* Add row */}
        <button
          type="button"
          onClick={() => onAddRow(false)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
        >
          <Plus className="h-3.5 w-3.5" />
          New page
        </button>
      </div>
    </div>
  );
}

// ─── Sortable wrapper for board card ─────────────────────────────────

function SortableBoardCard({
  row,
  schemaColumns,
  groupByKey,
  options,
  onNavigate,
  onDelete,
}: {
  row: DbNode;
  schemaColumns: SchemaColumn[];
  groupByKey: string;
  options: string[];
  onNavigate: (row: DbNode) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BoardCard
        row={row}
        schemaColumns={schemaColumns}
        groupByKey={groupByKey}
        options={options}
        onNavigate={onNavigate}
        onDelete={onDelete}
      />
    </div>
  );
}

// ─── Board Card ──────────────────────────────────────────────────────

interface BoardCardProps {
  row: DbNode;
  schemaColumns: SchemaColumn[];
  groupByKey: string;
  options: string[];
  isDragOverlay?: boolean;
  onNavigate: (row: DbNode) => void;
  onDelete: (id: string) => void;
}

function BoardCard({
  row,
  schemaColumns,
  groupByKey,
  options,
  isDragOverlay,
  onNavigate,
  onDelete,
}: BoardCardProps) {
  const properties = row.properties as Record<string, unknown>;

  // Find a "person" column to show avatar-like display
  const personCol = schemaColumns.find((c) => c.type === "person");
  const personValue = personCol
    ? String(properties[personCol.key] ?? "")
    : "";

  // Show other badge-worthy properties (selects not used as groupBy)
  const badgeCols = schemaColumns.filter(
    (c) => c.type === "select" && c.key !== groupByKey
  );

  return (
    <div
      className={`group rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md ${
        isDragOverlay ? "rotate-2 shadow-lg" : ""
      }`}
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <button
          type="button"
          className="flex-1 text-left text-sm font-medium leading-snug hover:underline"
          onClick={() => onNavigate(row)}
        >
          {row.title || (
            <span className="text-muted-foreground">Untitled</span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Card actions"
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onNavigate(row)}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(row.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Properties row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {badgeCols.map((col) => {
          const val = String(properties[col.key] ?? "");
          if (!val) return null;
          const color = getSelectColorForValue(val, col.options ?? []);
          return (
            <Badge
              key={col.key}
              variant="outline"
              className={`${color.bg} ${color.text} border-0 text-[10px] font-medium`}
            >
              {val}
            </Badge>
          );
        })}
      </div>

      {/* Person row */}
      {personValue && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {personValue.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-muted-foreground">{personValue}</span>
        </div>
      )}
    </div>
  );
}
