"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import type { DbNode } from "@/lib/types/database";

interface BreadcrumbsProps {
  nodeId: string;
}

interface Crumb {
  id: string;
  title: string;
}

export function Breadcrumbs({ nodeId }: BreadcrumbsProps) {
  const supabase = useSupabase();

  const { data: crumbs = [] } = useQuery<Crumb[]>({
    queryKey: ["breadcrumbs", nodeId],
    queryFn: async () => {
      const path: Crumb[] = [];
      let currentId: string | null = nodeId;

      // Walk up the tree (max 10 levels to prevent infinite loops)
      for (let i = 0; i < 10 && currentId; i++) {
        const { data, error } = await supabase
          .from("nodes")
          .select("id, title, parent_id")
          .eq("id", currentId)
          .single();
        if (error || !data) break;
        path.unshift({ id: data.id, title: data.title || "Untitled" });
        currentId = data.parent_id;
      }

      return path;
    },
  });

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      <Link
        href="/workspace"
        className="flex items-center gap-1 hover:text-foreground"
      >
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {i === crumbs.length - 1 ? (
            <span className="text-foreground">{crumb.title}</span>
          ) : (
            <Link
              href={`/workspace/${crumb.id}`}
              className="hover:text-foreground"
            >
              {crumb.title}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
