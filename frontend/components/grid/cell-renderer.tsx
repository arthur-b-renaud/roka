"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  // Sync from external
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

const SELECT_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
];

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[1.5rem] w-full cursor-pointer items-center text-left hover:bg-accent/50 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value ? (
          <Badge
            variant="outline"
            className={`${SELECT_COLORS[options.indexOf(value) % SELECT_COLORS.length] ?? ""} border-0 text-xs font-medium`}
          >
            {value}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground/60 italic">Select...</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="listbox" onKeyDown={handleKeyDown} className="absolute left-0 z-20 mt-1 min-w-[140px] rounded-md border bg-popover p-1 shadow-lg">
            {options.map((opt, i) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={value === opt}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Badge
                  variant="outline"
                  className={`${SELECT_COLORS[i % SELECT_COLORS.length] ?? ""} border-0 text-xs`}
                >
                  {opt}
                </Badge>
              </button>
            ))}
            {value && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
