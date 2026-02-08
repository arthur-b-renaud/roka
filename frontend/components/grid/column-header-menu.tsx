"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ColumnTypeSelector } from "./column-type-selector";
import {
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Trash2,
  Check,
  GripVertical,
  Type,
  Hash,
  List,
  Calendar,
  CheckSquare,
  User,
} from "lucide-react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { SchemaColumn } from "@/lib/types/database";

interface ColumnHeaderMenuProps {
  column: SchemaColumn;
  isSorted: false | "asc" | "desc";
  onRename: (newName: string) => void;
  onChangeType: (newType: SchemaColumn["type"], options?: string[]) => void;
  onSort: (direction: "asc" | "desc" | false) => void;
  onDelete: () => void;
  /** drag handle props from @dnd-kit */
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  text: Type,
  number: Hash,
  select: List,
  date: Calendar,
  checkbox: CheckSquare,
  person: User,
};

export function ColumnHeaderMenu({
  column,
  isSorted,
  onRename,
  onChangeType,
  onSort,
  onDelete,
  dragAttributes,
  dragListeners,
}: ColumnHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [localName, setLocalName] = useState(column.name);
  const [localType, setLocalType] = useState(column.type);
  const [localOptions, setLocalOptions] = useState(
    column.options?.join(", ") ?? ""
  );

  const handleNameBlur = () => {
    const trimmed = localName.trim();
    if (trimmed && trimmed !== column.name) {
      onRename(trimmed);
    }
  };

  const handleTypeChange = (newType: SchemaColumn["type"]) => {
    setLocalType(newType);
    if (newType !== "select") {
      onChangeType(newType);
    }
  };

  const handleOptionsBlur = () => {
    if (localType === "select") {
      const opts = localOptions
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      onChangeType("select", opts);
    }
  };

  // Sync local state when popover opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLocalName(column.name);
      setLocalType(column.type);
      setLocalOptions(column.options?.join(", ") ?? "");
    }
    setOpen(nextOpen);
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* Drag handle */}
      {dragAttributes && dragListeners && (
        <button
          type="button"
          className="cursor-grab rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            {TYPE_ICONS[column.type] && (() => {
              const Icon = TYPE_ICONS[column.type];
              return <Icon className="h-3 w-3 opacity-60" />;
            })()}
            <span>{column.name}</span>
            {isSorted === "asc" && <ArrowUpNarrowWide className="h-3 w-3 text-primary" />}
            {isSorted === "desc" && <ArrowDownWideNarrow className="h-3 w-3 text-primary" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3 space-y-3">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleNameBlur();
                }
              }}
              className="h-8 text-sm"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <ColumnTypeSelector value={localType} onChange={handleTypeChange} />
          </div>

          {/* Options for select type */}
          {localType === "select" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Options (comma separated)</Label>
              <Input
                value={localOptions}
                onChange={(e) => setLocalOptions(e.target.value)}
                onBlur={handleOptionsBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleOptionsBlur();
                }}
                placeholder="e.g. Todo, In Progress, Done"
                className="h-8 text-sm"
              />
            </div>
          )}

          <Separator />

          {/* Sort */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                onSort(isSorted === "asc" ? false : "asc");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              <ArrowUpNarrowWide className="h-3.5 w-3.5" />
              Sort ascending
              {isSorted === "asc" && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
            </button>
            <button
              type="button"
              onClick={() => {
                onSort(isSorted === "desc" ? false : "desc");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              Sort descending
              {isSorted === "desc" && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
            </button>
          </div>

          <Separator />

          {/* Delete */}
          <button
            type="button"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete property
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
