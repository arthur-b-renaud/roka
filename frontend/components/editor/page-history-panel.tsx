"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, RotateCcw, User, Bot, Terminal } from "lucide-react";
import type { NodeRevisionMeta } from "@/lib/types/database";
import type { Block } from "@blocknote/core";

const BlockNoteView = dynamic(
  () => import("@blocknote/mantine").then((m) => ({ default: m.BlockNoteView })),
  { ssr: false },
);

// ── Snake→camel mapping for restore ─────────────────────

const RESTORE_FIELD_MAP: Record<string, string> = {
  title: "title",
  icon: "icon",
  cover_url: "coverUrl",
  content: "content",
  properties: "properties",
  parent_id: "parentId",
  type: "type",
  is_pinned: "isPinned",
  sort_order: "sortOrder",
};

function mapSnapshotToUpdate(snapshot: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [snakeKey, camelKey] of Object.entries(RESTORE_FIELD_MAP)) {
    if (snakeKey in snapshot) {
      mapped[camelKey] = snapshot[snakeKey];
    }
  }
  return mapped;
}

// ── Relative time ───────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Actor icon ──────────────────────────────────────────

function ActorIcon({ type }: { type: string }) {
  if (type === "human") return <User className="h-3.5 w-3.5" />;
  if (type === "agent") return <Bot className="h-3.5 w-3.5" />;
  return <Terminal className="h-3.5 w-3.5" />;
}

// ── Operation label ─────────────────────────────────────

function operationLabel(op: string): string {
  if (op === "INSERT") return "Created";
  if (op === "DELETE") return "Deleted";
  return "Edited";
}

function operationVariant(op: string): "default" | "secondary" | "destructive" {
  if (op === "INSERT") return "default";
  if (op === "DELETE") return "destructive";
  return "secondary";
}

// ── Read-only preview ───────────────────────────────────

function RevisionPreview({ content }: { content: unknown[] | null }) {
  const { useCreateBlockNote } = require("@blocknote/react");

  const initialContent = useMemo(() => {
    if (!content || !Array.isArray(content) || content.length === 0) return undefined;
    return content as Block[];
  }, [content]);

  const editor = useCreateBlockNote({ initialContent });

  if (!content || !Array.isArray(content) || content.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No content snapshot available.
      </p>
    );
  }

  return (
    <div className="pointer-events-none min-h-[200px] opacity-90">
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────

interface PageHistoryPanelProps {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PageHistoryPanel({ nodeId, open, onOpenChange }: PageHistoryPanelProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Fetch timeline (metadata only)
  const {
    data: metaData,
    isLoading: metaLoading,
    fetchNextPage,
    hasNextPage,
  } = useTimelineQuery(nodeId, open);

  // Fetch full revision for preview when selected
  const { data: fullData } = useQuery({
    queryKey: ["node-revision-full", nodeId, selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const res = await api.nodes.history(nodeId, { fields: "full", limit: 100 });
      const revisions = (res.revisions ?? []) as Record<string, unknown>[];
      return revisions.find((r) => r.id === selectedId) ?? null;
    },
    enabled: open && !!selectedId,
  });

  // Auto-select first revision
  useEffect(() => {
    if (metaData?.revisions?.length && !selectedId) {
      setSelectedId((metaData.revisions[0] as NodeRevisionMeta).id);
    }
  }, [metaData, selectedId]);

  // Reset selection when panel closes
  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  const snapshotTitle = fullData?.new_data
    ? (fullData.new_data as Record<string, unknown>).title as string
    : null;
  const snapshotContent = fullData?.new_data
    ? ((fullData.new_data as Record<string, unknown>).content as unknown[])
    : null;

  const handleRestore = useCallback(async () => {
    if (!fullData?.new_data) return;
    setRestoring(true);
    try {
      const update = mapSnapshotToUpdate(fullData.new_data as Record<string, unknown>);
      await api.nodes.update(nodeId, update);
      queryClient.invalidateQueries({ queryKey: ["node", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["node-history-meta", nodeId] });
      onOpenChange(false);
    } finally {
      setRestoring(false);
      setConfirmRestore(false);
    }
  }, [fullData, nodeId, queryClient, onOpenChange]);

  const revisions = (metaData?.revisions ?? []) as NodeRevisionMeta[];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Page history
            </SheetTitle>
            <SheetDescription>
              Browse and restore previous versions of this page.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1">
            {/* Timeline sidebar */}
            <ScrollArea className="w-[260px] shrink-0 border-r">
              <div className="space-y-0.5 p-2">
                {metaLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-1.5 rounded-md p-2.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))
                ) : revisions.length === 0 ? (
                  <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                    No history yet.
                  </p>
                ) : (
                  revisions.map((rev) => (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => setSelectedId(rev.id)}
                      className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                        selectedId === rev.id
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <ActorIcon type={rev.actorType} />
                        <span className="truncate">
                          {rev.actorDisplayName}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge
                          variant={operationVariant(rev.operation)}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {operationLabel(rev.operation)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(rev.createdAt)}
                        </span>
                      </div>
                      {rev.changedFields && rev.changedFields.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rev.changedFields.slice(0, 3).map((f) => (
                            <span
                              key={f}
                              className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground"
                            >
                              {f}
                            </span>
                          ))}
                          {rev.changedFields.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">
                              +{rev.changedFields.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  ))
                )}
                {hasNextPage && (
                  <button
                    type="button"
                    className="w-full py-2 text-center text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => fetchNextPage?.()}
                  >
                    Load more
                  </button>
                )}
              </div>
            </ScrollArea>

            {/* Preview area */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {selectedId && fullData ? (
                <>
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                      <h3 className="text-sm font-medium">
                        {snapshotTitle || "Untitled"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(
                          (fullData as Record<string, unknown>).createdAt as string,
                        )}
                      </p>
                    </div>
                    {(fullData as Record<string, unknown>).operation !== "DELETE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmRestore(true)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    <RevisionPreview
                      key={selectedId}
                      content={snapshotContent}
                    />
                  </ScrollArea>
                </>
              ) : selectedId ? (
                <div className="flex flex-1 items-center justify-center">
                  <Skeleton className="h-6 w-32" />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Select a version to preview
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore confirmation */}
      <Dialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this version?</DialogTitle>
            <DialogDescription>
              The current page content will be replaced with this snapshot.
              A new revision will be recorded so you can always undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRestore(false)}
              disabled={restoring}
            >
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={restoring}>
              {restoring ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Timeline query with manual "load more" ──────────────

function useTimelineQuery(nodeId: string, enabled: boolean) {
  const [pages, setPages] = useState<NodeRevisionMeta[][]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  const currentOffset = pages.reduce((acc, p) => acc + p.length, 0);
  const hasNextPage = currentOffset < total;

  const { isLoading } = useQuery({
    queryKey: ["node-history-meta", nodeId, 0],
    queryFn: async () => {
      const res = await api.nodes.history(nodeId, {
        fields: "meta",
        limit: pageSize,
        offset: 0,
      });
      setPages([res.revisions as NodeRevisionMeta[]]);
      setTotal(res.total);
      return res;
    },
    enabled,
  });

  const fetchNextPage = useCallback(async () => {
    const res = await api.nodes.history(nodeId, {
      fields: "meta",
      limit: pageSize,
      offset: currentOffset,
    });
    setPages((prev) => [...prev, res.revisions as NodeRevisionMeta[]]);
    setTotal(res.total);
  }, [nodeId, currentOffset]);

  const revisions = useMemo(() => pages.flat(), [pages]);

  return {
    data: { revisions, total },
    isLoading,
    fetchNextPage: hasNextPage ? fetchNextPage : undefined,
    hasNextPage,
  };
}
