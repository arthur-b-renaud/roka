"use client";

import { useRef, useState } from "react";
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

  if (!editing) {
    return (
      <span
        className="block min-h-[1.5rem] cursor-text text-sm"
        onClick={() => {
          setLocalVal(value ?? "");
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {value || <span className="text-muted-foreground">Empty</span>}
      </span>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (localVal !== value) onChange(localVal);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (localVal !== value) onChange(localVal);
        }
        if (e.key === "Escape") {
          setEditing(false);
          setLocalVal(value ?? "");
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

  if (!editing) {
    return (
      <span
        className="block min-h-[1.5rem] cursor-text text-sm"
        onClick={() => {
          setLocalVal(String(value ?? ""));
          setEditing(true);
        }}
      >
        {value ?? <span className="text-muted-foreground">-</span>}
      </span>
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
      }}
      className="h-7 text-sm"
      autoFocus
    />
  );
}

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

  const colorMap: Record<number, string> = {
    0: "bg-blue-100 text-blue-800",
    1: "bg-green-100 text-green-800",
    2: "bg-yellow-100 text-yellow-800",
    3: "bg-purple-100 text-purple-800",
    4: "bg-red-100 text-red-800",
  };

  if (!open) {
    return (
      <div
        className="flex min-h-[1.5rem] cursor-pointer items-center"
        onClick={() => setOpen(true)}
      >
        {value ? (
          <Badge
            variant="outline"
            className={`${colorMap[options.indexOf(value) % 5] ?? ""} border-0 text-xs`}
          >
            {value}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Select...</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute z-10 mt-1 rounded-md border bg-popover p-1 shadow-md">
        {options.map((opt, i) => (
          <button
            key={opt}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
            onClick={() => {
              onChange(opt);
              setOpen(false);
            }}
          >
            <Badge
              variant="outline"
              className={`${colorMap[i % 5] ?? ""} border-0 text-xs`}
            >
              {opt}
            </Badge>
          </button>
        ))}
        {value && (
          <button
            className="flex w-full items-center rounded-sm px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="fixed inset-0" onClick={() => setOpen(false)} />
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
      className="h-7 w-36 text-sm"
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
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300"
    />
  );
}
