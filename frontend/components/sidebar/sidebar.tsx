"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { WorkspaceTree } from "./workspace-tree";
import {
  Plus,
  Search,
  Settings,
  LogOut,
  Home,
  Database,
} from "lucide-react";
import type { DbNode } from "@/lib/types/database";

export function Sidebar() {
  const router = useRouter();
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  // Fetch root-level pages (parent_id IS NULL, type = page)
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

  // Create new page
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
  });

  // Create new database
  const createDatabase = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      // Create the database node
      const { data: node, error: nodeErr } = await supabase
        .from("nodes")
        .insert({
          owner_id: userId,
          type: "database",
          title: "Untitled Database",
          content: [],
          properties: {},
        })
        .select()
        .single();
      if (nodeErr) throw nodeErr;

      // Create default schema
      const { error: defErr } = await supabase
        .from("database_definitions")
        .insert({
          node_id: node.id,
          schema_config: [
            { key: "status", name: "Status", type: "select", options: ["Todo", "In Progress", "Done"] },
            { key: "priority", name: "Priority", type: "select", options: ["Low", "Medium", "High"] },
          ],
        });
      if (defErr) throw defErr;
      return node as DbNode;
    },
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      router.push(`/workspace/${node.id}`);
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
    <aside className="flex h-full w-64 flex-col border-r bg-secondary/30">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold tracking-tight">Roka</h2>
      </div>

      <Separator />

      {/* Quick actions */}
      <div className="space-y-1 p-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm"
          onClick={openSearch}
        >
          <Search className="h-4 w-4" />
          Search
          <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Cmd+K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm"
          onClick={() => router.push("/workspace")}
        >
          <Home className="h-4 w-4" />
          Home
        </Button>
      </div>

      <Separator />

      {/* Create buttons */}
      <div className="flex gap-1 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start gap-2 text-sm"
          onClick={() => createPage.mutate()}
        >
          <Plus className="h-4 w-4" />
          Page
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start gap-2 text-sm"
          onClick={() => createDatabase.mutate()}
        >
          <Database className="h-4 w-4" />
          Database
        </Button>
      </div>

      <Separator />

      {/* Page tree */}
      <ScrollArea className="flex-1 p-2">
        <WorkspaceTree pages={pages} />
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="space-y-1 p-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm"
          onClick={() => router.push("/workspace/settings")}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
