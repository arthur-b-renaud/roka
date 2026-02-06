"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { PageEditor } from "@/components/editor/page-editor";
import { PageHeader } from "@/components/editor/page-header";
import { DatabaseView } from "@/components/grid/database-view";
import { Skeleton } from "@/components/ui/skeleton";
import type { DbNode } from "@/lib/types/database";

export default function NodePage() {
  const params = useParams();
  const nodeId = params.nodeId as string;
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
      return data as DbNode;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
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
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader node={node} />
      {node.type === "database" ? (
        <DatabaseView node={node} />
      ) : (
        <PageEditor node={node} />
      )}
    </div>
  );
}
