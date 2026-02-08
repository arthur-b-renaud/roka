"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast";
import { WorkspaceTree } from "./workspace-tree";
import {
  Plus,
  Search,
  Settings,
  LogOut,
  Home,
} from "lucide-react";
import type { DbNode } from "@/lib/types/database";

export function Sidebar() {
  const router = useRouter();
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  const { toast } = useToast();

  const { data: pages = [] } = useQuery<DbNode[]>({
    queryKey: ["sidebar-pages", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("owner_id", userId)
        .is("parent_id", null)
        .in("type", ["page", "database"])
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as DbNode[];
    },
    enabled: !!userId,
  });

  const createPage = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("nodes")
        .insert({
          owner_id: userId,
          type: "page",
          title: "Untitled",
          content: [],
          properties: {},
        })
        .select()
        .single();
      if (error) throw error;
      return data as DbNode;
    },
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      router.push(`/workspace/${node.id}`);
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to create page", "error");
    },
  });

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }, [supabase, router]);

  const openSearch = useCallback(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }, []);

  return (
    <aside
      aria-label="Sidebar navigation"
      className="flex h-full w-[240px] flex-col border-r bg-[hsl(var(--sidebar))]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold tracking-tight text-[hsl(var(--sidebar-foreground))]">
          Roka
        </h2>
      </div>

      {/* Nav actions */}
      <nav className="space-y-0.5 px-2 pb-1">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-[hsl(var(--sidebar-foreground))] transition-colors duration-150 hover:bg-accent/60"
        >
          <Search className="h-[15px] w-[15px] text-[hsl(var(--sidebar-muted))]" />
          Search
          <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Cmd+K
          </kbd>
        </button>
        <button
          onClick={() => router.push("/workspace")}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-[hsl(var(--sidebar-foreground))] transition-colors duration-150 hover:bg-accent/60"
        >
          <Home className="h-[15px] w-[15px] text-[hsl(var(--sidebar-muted))]" />
          Home
        </button>
        <button
          onClick={() => router.push("/workspace/settings")}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-[hsl(var(--sidebar-foreground))] transition-colors duration-150 hover:bg-accent/60"
        >
          <Settings className="h-[15px] w-[15px] text-[hsl(var(--sidebar-muted))]" />
          Settings
        </button>
      </nav>

      {/* Private section header with hover + */}
      <div className="group flex items-center justify-between px-3 pt-4 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Private
        </span>
        <button
          onClick={() => createPage.mutate()}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          aria-label="New page"
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      {/* Page tree */}
      <ScrollArea className="flex-1 px-2">
        <WorkspaceTree pages={pages} />
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-[hsl(var(--sidebar-muted))] transition-colors duration-150 hover:text-[hsl(var(--sidebar-foreground))]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
