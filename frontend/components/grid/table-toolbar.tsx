"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpDown,
  Filter,
  X,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Plus,
} from "lucide-react";
import type { SchemaColumn, ViewSort, ViewFilter } from "@/lib/types/database";

// Operators per column type
const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "does_not_contain", label: "does not contain" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: ">=" },
    { value: "lte", label: "<=" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  select: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  date: [
    { value: "is", label: "is" },
    { value: "is_before", label: "is before" },
    { value: "is_after", label: "is after" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  checkbox: [
    { value: "is_true", label: "is checked" },
    { value: "is_false", label: "is not checked" },
  ],
  person: [
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};

function getOperators(type: string) {
  return OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.text;
}

function operatorNeedsValue(op: string): boolean {
  return !["is_empty", "is_not_empty", "is_true", "is_false"].includes(op);
}

interface TableToolbarProps {
  columns: SchemaColumn[];
  sorts: ViewSort[];
  filters: ViewFilter[];
  onSortsChange: (sorts: ViewSort[]) => void;
  onFiltersChange: (filters: ViewFilter[]) => void;
}

export function TableToolbar({
  columns,
  sorts,
  filters,
  onSortsChange,
  onFiltersChange,
}: TableToolbarProps) {
  const hasSorts = sorts.length > 0;
  const hasFilters = filters.length > 0;

  return (
    <div className="flex items-center gap-2 px-1">
      {/* Sort control */}
      <SortControl
        columns={columns}
        sorts={sorts}
        onSortsChange={onSortsChange}
      />

      {/* Filter control */}
      <FilterControl
        columns={columns}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />

      {/* Active sort pills */}
      {hasSorts && (
        <div className="flex items-center gap-1">
          {sorts.map((s, i) => {
            const col = columns.find((c) => c.key === s.columnKey);
            return (
              <Badge
                key={`sort-${i}`}
                variant="secondary"
                className="gap-1 px-2 py-0.5 text-xs font-normal"
              >
                {s.direction === "asc" ? (
                  <ArrowUpNarrowWide className="h-3 w-3" />
                ) : (
                  <ArrowDownWideNarrow className="h-3 w-3" />
                )}
                {col?.name ?? s.columnKey}
                <button
                  type="button"
                  onClick={() =>
                    onSortsChange(sorts.filter((_, idx) => idx !== i))
                  }
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Active filter pills */}
      {hasFilters && (
        <div className="flex items-center gap-1">
          {filters.map((f, i) => {
            const col = columns.find((c) => c.key === f.columnKey);
            const opLabel =
              getOperators(col?.type ?? "text").find(
                (o) => o.value === f.operator
              )?.label ?? f.operator;
            return (
              <Badge
                key={`filter-${i}`}
                variant="secondary"
                className="gap-1 px-2 py-0.5 text-xs font-normal"
              >
                <Filter className="h-3 w-3" />
                {col?.name ?? f.columnKey} {opLabel}{" "}
                {f.value != null && operatorNeedsValue(f.operator)
                  ? `"${String(f.value)}"`
                  : ""}
                <button
                  type="button"
                  onClick={() =>
                    onFiltersChange(filters.filter((_, idx) => idx !== i))
                  }
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Sort popover ---

function SortControl({
  columns,
  sorts,
  onSortsChange,
}: {
  columns: SchemaColumn[];
  sorts: ViewSort[];
  onSortsChange: (sorts: ViewSort[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCol, setSelectedCol] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const addSort = () => {
    if (!selectedCol) return;
    // Replace existing sort on same column
    const filtered = sorts.filter((s) => s.columnKey !== selectedCol);
    onSortsChange([...filtered, { columnKey: selectedCol, direction }]);
    setSelectedCol("");
    setDirection("asc");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort
          {sorts.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
              {sorts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Add a sort</p>
        <div className="space-y-2">
          <select
            value={selectedCol}
            onChange={(e) => setSelectedCol(e.target.value)}
            aria-label="Sort by property"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Select property...</option>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={direction}
              onChange={(e) =>
                setDirection(e.target.value as "asc" | "desc")
              }
              aria-label="Sort direction"
              className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <Button
              size="sm"
              className="h-8"
              onClick={addSort}
              disabled={!selectedCol}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
        </div>

        {sorts.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onSortsChange([])}
            >
              Clear all sorts
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Filter popover ---

function FilterControl({
  columns,
  filters,
  onFiltersChange,
}: {
  columns: SchemaColumn[];
  filters: ViewFilter[];
  onFiltersChange: (filters: ViewFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCol, setSelectedCol] = useState("");
  const [operator, setOperator] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const selectedColumn = columns.find((c) => c.key === selectedCol);
  const operators = getOperators(selectedColumn?.type ?? "text");
  const needsValue = operator ? operatorNeedsValue(operator) : true;

  // For select columns, show option picker instead of text input
  const isSelectColumn = selectedColumn?.type === "select";

  const addFilter = () => {
    if (!selectedCol || !operator) return;
    if (needsValue && !filterValue.trim()) return;
    const newFilter: ViewFilter = {
      columnKey: selectedCol,
      operator,
      value: needsValue ? filterValue.trim() : undefined,
    };
    onFiltersChange([...filters, newFilter]);
    setSelectedCol("");
    setOperator("");
    setFilterValue("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5" />
          Filter
          {filters.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Add a filter
        </p>
        <div className="space-y-2">
          <select
            value={selectedCol}
            onChange={(e) => {
              setSelectedCol(e.target.value);
              setOperator("");
              setFilterValue("");
            }}
            aria-label="Filter by property"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Select property...</option>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>

          {selectedCol && (
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              aria-label="Filter condition"
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Select condition...</option>
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          )}

          {selectedCol && operator && needsValue && (
            <>
              {isSelectColumn && selectedColumn?.options ? (
                <select
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Select value...</option>
                  {selectedColumn.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder="Value..."
                  className="h-8 text-sm"
                  type={selectedColumn?.type === "number" ? "number" : selectedColumn?.type === "date" ? "date" : "text"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addFilter();
                  }}
                />
              )}
            </>
          )}

          <Button
            size="sm"
            className="h-8 w-full"
            onClick={addFilter}
            disabled={!selectedCol || !operator || (needsValue && !filterValue.trim())}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add filter
          </Button>
        </div>

        {filters.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onFiltersChange([])}
            >
              Clear all filters
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { getOperators, operatorNeedsValue };
