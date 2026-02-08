"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, X } from "lucide-react";

interface CellRendererProps {
  type: string;
  value: unknown;
  options?: string[];
  onChange: (value: unknown) => void;
}

export function CellRenderer({ type, value, options, onChange }: CellRendererProps) {
  switch (type) {
    case "text":
      return <TextCell value={value as string} onChange={onChange} />;
    case "number":
      return <NumberCell value={value as number} onChange={onChange} />;
    case "select":
      return (
        <SelectCell
          value={value as string}
          options={options ?? []}
          onChange={onChange}
        />
      );
    case "date":
      return <DateCell value={value as string} onChange={onChange} />;
    case "checkbox":
      return <CheckboxCell value={value as boolean} onChange={onChange} />;
    case "person":
      return <TextCell value={value as string} onChange={onChange} />;
    default:
      return <TextCell value={String(value ?? "")} onChange={onChange} />;
  }
}

// ─── Shared color palette for select options ──────────────────────

export const SELECT_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-800 dark:text-blue-300", dot: "bg-blue-500" },
  { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-800 dark:text-green-300", dot: "bg-green-500" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-800 dark:text-purple-300", dot: "bg-purple-500" },
  { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-300", dot: "bg-red-500" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-800 dark:text-pink-300", dot: "bg-pink-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-800 dark:text-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-800 dark:text-orange-300", dot: "bg-orange-500" },
];

export function getSelectColor(index: number) {
  return SELECT_COLORS[index % SELECT_COLORS.length];
}

export function getSelectColorForValue(value: string, options: string[]) {
  const idx = options.indexOf(value);
  return idx >= 0 ? getSelectColor(idx) : SELECT_COLORS[0];
}

// ─── Text Cell ────────────────────────────────────────────────────

function TextCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocalVal(value ?? "");
  }, [value, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="block min-h-[1.5rem] w-full cursor-text text-sm text-left hover:bg-accent/50 rounded px-1"
      >
        {value || <span className="text-muted-foreground/60 italic">Empty</span>}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (localVal !== (value ?? "")) onChange(localVal);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (localVal !== (value ?? "")) onChange(localVal);
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="h-7 text-sm"
      autoFocus
    />
  );
}

// ─── Number Cell ──────────────────────────────────────────────────

function NumberCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(String(value ?? ""));

  useEffect(() => {
    if (!editing) setLocalVal(String(value ?? ""));
  }, [value, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block min-h-[1.5rem] w-full cursor-text text-sm tabular-nums text-left hover:bg-accent/50 rounded px-1"
      >
        {value != null ? value : <span className="text-muted-foreground/60 italic">-</span>}
      </button>
    );
  }

  return (
    <Input
      type="number"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const num = parseFloat(localVal);
        if (!isNaN(num) && num !== value) onChange(num);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          const num = parseFloat(localVal);
          if (!isNaN(num)) onChange(num);
        }
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-7 text-sm"
      autoFocus
    />
  );
}

// ─── Select Cell (Popover-based) ──────────────────────────────────

function SelectCell({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex min-h-[1.5rem] w-full cursor-pointer items-center text-left hover:bg-accent/50 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value ? (() => {
            const color = getSelectColorForValue(value, options);
            return (
              <Badge
                variant="outline"
                className={`${color.bg} ${color.text} border-0 text-xs font-medium`}
              >
                {value}
              </Badge>
            );
          })() : (
            <span className="text-sm text-muted-foreground/60 italic">Select...</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1" sideOffset={4}>
        <div role="listbox" className="space-y-0.5">
          {options.map((opt, i) => {
            const color = getSelectColor(i);
            const isSelected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isSelected}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Badge
                  variant="outline"
                  className={`${color.bg} ${color.text} border-0 text-xs`}
                >
                  {opt}
                </Badge>
                {isSelected && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
          {value && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Date Cell ────────────────────────────────────────────────────

function DateCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-40 text-sm"
    />
  );
}

// ─── Checkbox Cell ────────────────────────────────────────────────

function CheckboxCell({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[1.5rem] items-center">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Toggle checkbox"
        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
      />
    </div>
  );
}
