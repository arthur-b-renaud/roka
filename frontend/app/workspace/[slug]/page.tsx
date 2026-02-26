"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/editor/page-header";
import { Breadcrumbs } from "@/components/editor/breadcrumbs";
import { EditorErrorBoundary } from "@/components/editor/error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle } from "lucide-react";

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
const ReadOnlyEditor = dynamic(
  () => import("@/components/editor/read-only-editor").then((m) => ({ default: m.ReadOnlyEditor })),
  { ssr: false }
);
import { dbNodeSchema, type DbNode } from "@/lib/types/database";
import { parseNodeId } from "@/lib/slug";

type NodeWithAccess = DbNode & { accessLevel?: "owner" | "viewer" };

export default function NodePage() {
  const params = useParams();
  const router = useRouter();
  const rawSlug = params.slug as string;
  const nodeId = parseNodeId(rawSlug) ?? "";
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: node, isLoading, error } = useQuery<NodeWithAccess>({
    queryKey: ["node", nodeId],
    queryFn: async () => {
      const raw = await api.nodes.get(nodeId);
      const parsed = dbNodeSchema.parse(raw);
      return { ...parsed, accessLevel: (raw as { accessLevel?: string }).accessLevel as "owner" | "viewer" | undefined };
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

  const isViewer = node.accessLevel === "viewer";

  return (
    <div className="mx-auto max-w-5xl px-8 pt-4 pb-8">
      <Breadcrumbs nodeId={nodeId} />
      {isViewer && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          You are viewing this page as a team member (read-only).
        </div>
      )}
      <EditorErrorBoundary>
        {node.type === "database" ? (
          <>
            <PageHeader node={node} onOpenHistory={isViewer ? undefined : () => setHistoryOpen(true)} readOnly={isViewer} />
            <DatabaseView key={node.id} node={node} />
          </>
        ) : node.type === "database_row" ? (
          <DatabaseRowPage key={node.id} node={node} />
        ) : (
          <>
            <PageHeader node={node} onOpenHistory={isViewer ? undefined : () => setHistoryOpen(true)} readOnly={isViewer} />
            {isViewer ? (
              <ReadOnlyEditor key={node.id} content={node.content} />
            ) : (
              <>
                <PageEditor key={node.id} node={node} />
                <div className="mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => router.push(`/workspace/chat?nodeId=${node.id}`)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Ask agent about this page
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </EditorErrorBoundary>
      {!isViewer && (
        <PageHistoryPanel
          nodeId={nodeId}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      )}
    </div>
  );
}
