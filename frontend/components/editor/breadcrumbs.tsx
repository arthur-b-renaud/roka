"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";

interface BreadcrumbsProps {
  nodeId: string;
}

interface Crumb {
  id: string;
  title: string;
  icon: string | null;
}

export function Breadcrumbs({ nodeId }: BreadcrumbsProps) {
  const { data: crumbs = [] } = useQuery<Crumb[]>({
    queryKey: ["breadcrumbs", nodeId],
    queryFn: async () => {
      const path: Crumb[] = [];
      let currentId: string | null = nodeId;

      for (let i = 0; i < 10 && currentId; i++) {
        const data = await api.nodes.get(currentId);
        if (!data) break;
        path.unshift({
          id: data.id,
          title: data.title || "Untitled",
          icon: data.icon ?? null,
        });
        currentId = data.parentId ?? data.parent_id ?? null;
      }

      return path;
    },
  });

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      <Link
        href="/workspace"
        className="flex items-center gap-1 hover:text-foreground"
        aria-label="Home"
      >
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {i === crumbs.length - 1 ? (
            <span className="flex items-center gap-1 text-foreground">
              {crumb.icon && <span className="text-sm">{crumb.icon}</span>}
              {crumb.title}
            </span>
          ) : (
            <Link
              href={`/workspace/${crumb.id}`}
              className="flex items-center gap-1 hover:text-foreground"
            >
              {crumb.icon && <span className="text-sm">{crumb.icon}</span>}
              {crumb.title}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
