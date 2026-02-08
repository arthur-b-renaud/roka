"use client";

import type { SchemaColumn } from "@/lib/types/database";

export const COLUMN_TYPES: { value: SchemaColumn["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "person", label: "Person" },
];

interface ColumnTypeSelectorProps {
  value: SchemaColumn["type"];
  onChange: (type: SchemaColumn["type"]) => void;
}

export function ColumnTypeSelector({ value, onChange }: ColumnTypeSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Column type" className="grid grid-cols-3 gap-1.5">
      {COLUMN_TYPES.map((ct) => (
        <button
          key={ct.value}
          type="button"
          role="radio"
          aria-checked={value === ct.value}
          onClick={() => onChange(ct.value)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            value === ct.value
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border hover:bg-muted"
          }`}
        >
          {ct.label}
        </button>
      ))}
    </div>
  );
}
