"use client";

import { memo, useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { ChevronRight, FileText, Database, Image, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbNode } from "@/lib/types/database";

const nodeIcons: Record<string, React.ElementType> = {
  page: FileText,
  database: Database,
  database_row: Table2,
  image: Image,
};

interface WorkspaceTreeProps {
  pages: DbNode[];
}

export function WorkspaceTree({ pages }: WorkspaceTreeProps) {
  if (pages.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
        No pages yet. Create one to get started.
      </p>
    );
  }

  return (
    <div role="tree" className="space-y-0.5">
      {pages.map((page) => (
        <TreeNode key={page.id} node={page} depth={0} />
      ))}
    </div>
  );
}

const TreeNode = memo(function TreeNode({ node, depth }: { node: DbNode; depth: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useSupabase();
  const [expanded, setExpanded] = useState(false);
  const isActive = pathname === `/workspace/${node.id}`;

  const Icon = nodeIcons[node.type] ?? FileText;

  const childTypes =
    node.type === "database"
      ? ["page", "database", "database_row"]
      : ["page", "database"];

  const { data: children = [] } = useQuery<DbNode[]>({
    queryKey: ["node-children", node.id, childTypes.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("parent_id", node.id)
        .in("type", childTypes)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DbNode[];
    },
    enabled: expanded,
    staleTime: 30_000,
  });

  const toggleExpand = useCallback(() => setExpanded((prev) => !prev), []);
  const navigate = useCallback(() => router.push(`/workspace/${node.id}`), [router, node.id]);

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent",
          isActive && "bg-accent font-medium"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={toggleExpand}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-90"
            )}
          />
        </button>
        <button
          onClick={navigate}
          className="flex flex-1 items-center gap-2 truncate"
        >
          {node.icon ? (
            <span className="text-sm">{node.icon}</span>
          ) : (
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.title || "Untitled"}</span>
        </button>
      </div>

      {expanded && children.length > 0 && (
        <div role="group">
          {children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});
