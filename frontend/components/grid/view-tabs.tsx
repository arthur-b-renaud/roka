"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Table2,
  Columns3,
} from "lucide-react";
import type { DbDatabaseView, ViewType } from "@/lib/types/database";

interface ViewTabsProps {
  views: DbDatabaseView[];
  activeViewId: string | null;
  onSelectView: (viewId: string) => void;
  onCreateView: (viewType: ViewType) => void;
  onRenameView: (viewId: string, name: string) => void;
  onDuplicateView: (viewId: string) => void;
  onDeleteView: (viewId: string) => void;
}

function getViewIcon(viewType: string) {
  switch (viewType) {
    case "board":
      return <Columns3 className="h-3.5 w-3.5" />;
    default:
      return <Table2 className="h-3.5 w-3.5" />;
  }
}

export function ViewTabs({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
}: ViewTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const startRename = (view: DbDatabaseView) => {
    setEditingId(view.id);
    setEditName(view.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRenameView(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  };

  return (
    <div className="flex items-center gap-0.5 border-b px-1">
      {views.map((view) => {
        const isActive = view.id === activeViewId;
        const isEditing = editingId === view.id;
        const viewType = view.viewConfig?.viewType ?? "table";

        return (
          <div key={view.id} className="flex items-center">
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditName("");
                  }
                }}
                className="h-7 w-28 text-xs"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelectView(view.id)}
                className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {getViewIcon(viewType)}
                {view.name}
              </button>
            )}

            {isActive && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="View options"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => startRename(view)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicateView(view.id)}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  {views.length > 1 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDeleteView(view.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {/* Add view popover */}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            onClick={() => {
              onCreateView("table");
              setAddOpen(false);
            }}
          >
            <Table2 className="h-4 w-4 text-muted-foreground" />
            Table
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            onClick={() => {
              onCreateView("board");
              setAddOpen(false);
            }}
          >
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            Board
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
