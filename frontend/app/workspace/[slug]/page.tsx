"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/editor/page-header";
import { Breadcrumbs } from "@/components/editor/breadcrumbs";
import { EditorErrorBoundary } from "@/components/editor/error-boundary";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Skeleton } from "@/components/ui/skeleton";

const PageEditor = dynamic(
  () => import("@/components/editor/page-editor").then((m) => ({ default: m.PageEditor })),
  { ssr: false }
);
const DatabaseView = dynamic(
  () => import("@/components/grid/database-view").then((m) => ({ default: m.DatabaseView })),
  { ssr: false }
);
const DatabaseRowPage = dynamic(
  () => import("@/components/grid/database-row-page").then((m) => ({ default: m.DatabaseRowPage })),
  { ssr: false }
);
const PageHistoryPanel = dynamic(
  () => import("@/components/editor/page-history-panel").then((m) => ({ default: m.PageHistoryPanel })),
  { ssr: false }
);
import { dbNodeSchema, type DbNode } from "@/lib/types/database";
import { parseNodeId } from "@/lib/slug";

export default function NodePage() {
  const params = useParams();
  const rawSlug = params.slug as string;
  const nodeId = parseNodeId(rawSlug) ?? "";
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: node, isLoading, error } = useQuery<DbNode>({
    queryKey: ["node", nodeId],
    queryFn: async () => {
      const data = await api.nodes.get(nodeId);
      return dbNodeSchema.parse(data);
    },
    enabled: !!nodeId,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-8 pt-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }

  if (error || !node) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Page not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-8 pt-4 pb-8">
      <Breadcrumbs nodeId={nodeId} />
      <EditorErrorBoundary>
        {node.type === "database" ? (
          <>
            <PageHeader node={node} onOpenHistory={() => setHistoryOpen(true)} />
            <DatabaseView key={node.id} node={node} />
          </>
        ) : node.type === "database_row" ? (
          <DatabaseRowPage key={node.id} node={node} />
        ) : (
          <>
            <PageHeader node={node} onOpenHistory={() => setHistoryOpen(true)} />
            <PageEditor key={node.id} node={node} />
            <div className="mt-6">
              <ChatPanel nodeId={node.id} minimalMode />
            </div>
          </>
        )}
      </EditorErrorBoundary>
      <PageHistoryPanel
        nodeId={nodeId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
