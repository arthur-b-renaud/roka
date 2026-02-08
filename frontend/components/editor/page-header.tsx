"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { DbNode } from "@/lib/types/database";

interface PageHeaderProps {
  node: DbNode;
}

export function PageHeader({ node }: PageHeaderProps) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(node.title);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync title from prop
  useEffect(() => {
    setTitle(node.title);
  }, [node.title]);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      await supabase
        .from("nodes")
        .update({ title: newTitle })
        .eq("id", node.id);
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    },
    [supabase, node.id, queryClient]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveTitle(newTitle), 500);
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
      <div className="flex items-center gap-3">
        {node.icon && <span className="text-3xl">{node.icon}</span>}
        <input
          value={title}
          onChange={handleChange}
          aria-label="Page title"
          className="w-full bg-transparent text-[32px] font-bold leading-tight tracking-tight outline-none placeholder:text-muted-foreground"
          placeholder="Untitled"
        />
      </div>
    </div>
  );
}
