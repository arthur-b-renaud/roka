"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast";
import { WorkspaceTree } from "./workspace-tree";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateDatabase } from "@/lib/hooks/use-create-database";
import { api } from "@/lib/api";
import {
  Plus,
  Search,
  Settings,
  LogOut,
  Home,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Database,
} from "lucide-react";
import type { DbNode } from "@/lib/types/database";

export function Sidebar() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  const { toast } = useToast();
  const { collapsed, toggle } = useSidebar();
  const createDatabase = useCreateDatabase();

  const { data: pages = [] } = useQuery<DbNode[]>({
    queryKey: ["sidebar-pages", userId],
    queryFn: async () => {
      if (!userId) return [];
      return api.nodes.list({
        type: "page,database",
        parentId: "null",
        orderBy: "sort_order",
      });
    },
    enabled: !!userId,
  });

  const createPage = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      return api.nodes.create({
        type: "page",
        title: "Untitled",
        content: [],
        properties: {},
      }) as Promise<DbNode>;
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
    await signOut({ redirect: false });
    router.push("/auth/login");
    router.refresh();
  }, [router]);

  const openSearch = useCallback(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }, []);

  return (
    <aside
      aria-label="Sidebar navigation"
      className={cn(
        "flex h-full flex-col border-r bg-[hsl(var(--sidebar))] transition-[width,min-width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-0 min-w-0 border-r-0" : "w-[240px] min-w-[240px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold tracking-tight text-[hsl(var(--sidebar-foreground))]">
          Roka
        </h2>
        <button
          onClick={toggle}
          className="rounded-md p-0.5 text-[hsl(var(--sidebar-muted))] transition-colors hover:text-[hsl(var(--sidebar-foreground))] hover:bg-accent/60"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Nav actions */}
      <nav className="space-y-0.5 px-2 pb-1">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-[hsl(var(--sidebar-foreground))] transition-colors duration-150 hover:bg-accent/60"
        >
          <Search className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--sidebar-muted))]" />
          Search
          <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Cmd+K
          </kbd>
        </button>
        <button
          onClick={() => router.push("/workspace")}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-[hsl(var(--sidebar-foreground))] transition-colors duration-150 hover:bg-accent/60"
        >
          <Home className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--sidebar-muted))]" />
          Home
        </button>
        <button
          onClick={() => router.push("/workspace/settings")}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-[hsl(var(--sidebar-foreground))] transition-colors duration-150 hover:bg-accent/60"
        >
          <Settings className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--sidebar-muted))]" />
          Settings
        </button>
      </nav>

      {/* Private section header with hover + */}
      <div className="group flex items-center justify-between px-3 pt-4 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Private
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              aria-label="New page or database"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <DropdownMenuItem onClick={() => createPage.mutate()}>
              <FileText className="mr-2 h-4 w-4" />
              New Page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => createDatabase.mutate()}>
              <Database className="mr-2 h-4 w-4" />
              New Database
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

/** Floating button to expand sidebar when collapsed */
export function SidebarExpandButton() {
  const { collapsed, toggle } = useSidebar();

  if (!collapsed) return null;

  return (
    <button
      onClick={toggle}
      className="fixed top-2.5 left-2.5 z-30 rounded-md border bg-background p-1.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground hover:bg-accent/60"
      aria-label="Expand sidebar"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}
