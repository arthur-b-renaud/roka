"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConvertToDatabase } from "@/lib/hooks/use-create-database";
import { Smile, MoreHorizontal, Database } from "lucide-react";
import type { DbNode } from "@/lib/types/database";

interface PageHeaderProps {
  node: DbNode;
}

export function PageHeader({ node }: PageHeaderProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(node.title);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const convertToDatabase = useConvertToDatabase();
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  useEffect(() => {
    setTitle(node.title);
  }, [node.title]);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      await api.nodes.update(node.id, { title: newTitle });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    },
    [node.id, queryClient]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveTitle(newTitle), 500);
  };

  const handleIconChange = useCallback(
    async (emoji: string | null) => {
      await api.nodes.update(node.id, { icon: emoji });
      queryClient.invalidateQueries({ queryKey: ["node", node.id] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["breadcrumbs"] });
    },
    [node.id, queryClient]
  );

  const handleConvertClick = () => {
    const hasContent = Array.isArray(node.content) && node.content.length > 0;
    if (hasContent) {
      setShowConvertDialog(true);
    } else {
      convertToDatabase.mutate(node.id);
    }
  };

  const confirmConvert = () => {
    setShowConvertDialog(false);
    convertToDatabase.mutate(node.id);
  };

  return (
    <div className="mb-4 space-y-1.5">
      {node.cover_url && (
        <div className="relative h-[200px] w-full overflow-hidden rounded-lg">
          <img
            src={node.cover_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {!node.icon && (
        <EmojiPicker value={node.icon} onChange={handleIconChange}>
          <button className="group/icon flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-accent/60 hover:opacity-100 focus:opacity-100 [div:hover>&]:opacity-100">
            <Smile className="h-3.5 w-3.5" />
            Add icon
          </button>
        </EmojiPicker>
      )}

      <div className="flex items-center gap-3">
        {node.icon && (
          <EmojiPicker value={node.icon} onChange={handleIconChange}>
            <button
              className="text-3xl transition-transform hover:scale-110"
              aria-label="Change icon"
            >
              {node.icon}
            </button>
          </EmojiPicker>
        )}
        <input
          value={title}
          onChange={handleChange}
          aria-label="Page title"
          className="w-full bg-transparent text-3xl font-bold leading-snug tracking-tight outline-none placeholder:text-muted-foreground/50"
          placeholder="Untitled"
        />
        {node.type === "page" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/60 hover:text-foreground [div:hover>&]:opacity-100"
                aria-label="Page options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onClick={handleConvertClick}>
                <Database className="mr-2 h-4 w-4" />
                Convert to Database
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Database?</DialogTitle>
            <DialogDescription>
              This page has editor content that will be cleared when converting
              to a database. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConvertDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmConvert}>
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
