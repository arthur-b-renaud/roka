"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SchemaColumn } from "@/lib/types/database";

const COLUMN_TYPES: { value: SchemaColumn["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "person", label: "Person" },
];

interface AddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingKeys: string[];
  onAdd: (column: SchemaColumn) => Promise<void>;
}

export function AddColumnDialog({
  open,
  onOpenChange,
  existingKeys,
  onAdd,
}: AddColumnDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SchemaColumn["type"]>("text");
  const [options, setOptions] = useState(""); // comma-separated for select
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const key = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    if (existingKeys.includes(key)) return;

    setSaving(true);
    const column: SchemaColumn = { key, name: name.trim(), type };
    if (type === "select" && options.trim()) {
      column.options = options
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
    }

    await onAdd(column);
    setSaving(false);
    setName("");
    setType("text");
    setOptions("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add property</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="col-name">Name</Label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Status, Due Date"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {COLUMN_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setType(ct.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    type === ct.value
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {type === "select" && (
            <div className="space-y-2">
              <Label htmlFor="col-options">Options (comma separated)</Label>
              <Input
                id="col-options"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="e.g. Todo, In Progress, Done"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
