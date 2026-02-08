"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { PageEditor } from "@/components/editor/page-editor";
import { PageHeader } from "@/components/editor/page-header";
import { Breadcrumbs } from "@/components/editor/breadcrumbs";
import { EditorErrorBoundary } from "@/components/editor/error-boundary";
import { DatabaseView } from "@/components/grid/database-view";
import { DatabaseRowPage } from "@/components/grid/database-row-page";
import { Skeleton } from "@/components/ui/skeleton";
import { dbNodeSchema, uuidSchema, type DbNode } from "@/lib/types/database";

export default function NodePage() {
  const params = useParams();
  const rawNodeId = params.nodeId as string;
  const nodeId = uuidSchema.safeParse(rawNodeId).success ? rawNodeId : "";
  const supabase = useSupabase();

  const { data: node, isLoading, error } = useQuery<DbNode>({
    queryKey: ["node", nodeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("id", nodeId)
        .single();
      if (error) throw error;
      return dbNodeSchema.parse(data);
    },
    enabled: !!nodeId,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-24 pt-4">
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
    <div className="mx-auto max-w-4xl px-24 pt-4 pb-8">
      <Breadcrumbs nodeId={nodeId} />
      <EditorErrorBoundary>
        {node.type === "database" ? (
          <>
            <PageHeader node={node} />
            <DatabaseView key={node.id} node={node} />
          </>
        ) : node.type === "database_row" ? (
          <DatabaseRowPage key={node.id} node={node} />
        ) : (
          <>
            <PageHeader node={node} />
            <PageEditor key={node.id} node={node} />
          </>
        )}
      </EditorErrorBoundary>
    </div>
  );
}
