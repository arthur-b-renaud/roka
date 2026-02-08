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
import { ColumnTypeSelector } from "./column-type-selector";
import type { SchemaColumn } from "@/lib/types/database";

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
  const [options, setOptions] = useState("");
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
            <ColumnTypeSelector value={type} onChange={setType} />
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
