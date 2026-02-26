"use client";

import { memo, useCallback, useState, useRef, useEffect, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useToast } from "@/components/ui/toast";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { api } from "@/lib/api";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  FileText,
  Database,
  Image,
  Table2,
  MoreHorizontal,
  Plus,
  Star,
  Link2,
  Copy,
  Pencil,
  MoveRight,
  Trash2,
  ExternalLink,
  PanelRightOpen,
  Globe,
  Users,
} from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { nodeUrl } from "@/lib/slug";
import type { DbNode } from "@/lib/types/database";
import { formatDistanceToNow } from "date-fns";

// Icon map
const nodeIcons: Record<string, React.ElementType> = {
  page: FileText,
  database: Database,
  database_row: Table2,
  image: Image,
};

function VisibilityBadge({ visibility }: { visibility?: string }) {
  if (!visibility || visibility === "private") return null;
  if (visibility === "team")
    return <Users className="h-3 w-3 shrink-0 text-blue-500" aria-label="Shared with team" />;
  if (visibility === "shared")
    return <Link2 className="h-3 w-3 shrink-0 text-orange-500" aria-label="Share link active" />;
  if (visibility === "published")
    return <Globe className="h-3 w-3 shrink-0 text-green-500" aria-label="Published" />;
  return null;
}

// Shared menu items renderer
interface MenuParts {
  Item: React.ComponentType<{
    onSelect?: () => void;
    className?: string;
    children: React.ReactNode;
    disabled?: boolean;
  }>;
  Separator: React.ComponentType<{ className?: string }>;
  Shortcut: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  Label: React.ComponentType<{ children: React.ReactNode; className?: string }>;
}

interface NodeActions {
  onFavorite: () => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onMoveTo: () => void;
  onTrash: () => void;
  onOpenNewTab: () => void;
  onOpenSidePeek: () => void;
  isPinned: boolean;
  updatedAt: string;
}

function renderNodeMenu(parts: MenuParts, actions: NodeActions) {
  const { Item, Separator, Shortcut, Label } = parts;
  const timeAgo = formatDistanceToNow(new Date(actions.updatedAt), { addSuffix: true });

  return (
    <>
      <Label className="px-2 py-1 text-xs font-medium text-muted-foreground">Page</Label>
      <Item onSelect={actions.onFavorite}>
        <Star className={cn("mr-2 h-4 w-4", actions.isPinned && "fill-yellow-400 text-yellow-400")} />
        {actions.isPinned ? "Remove from Favorites" : "Add to Favorites"}
      </Item>
      <Separator />
      <Item onSelect={actions.onCopyLink}>
        <Link2 className="mr-2 h-4 w-4" />Copy link
      </Item>
      <Item onSelect={actions.onDuplicate}>
        <Copy className="mr-2 h-4 w-4" />Duplicate<Shortcut>Ctrl+D</Shortcut>
      </Item>
      <Item onSelect={actions.onRename}>
        <Pencil className="mr-2 h-4 w-4" />Rename<Shortcut>Ctrl+Shift+R</Shortcut>
      </Item>
      <Item onSelect={actions.onMoveTo}>
        <MoveRight className="mr-2 h-4 w-4" />Move to<Shortcut>Ctrl+Shift+P</Shortcut>
      </Item>
      <Separator />
      <Item onSelect={actions.onTrash} className="text-destructive focus:text-destructive focus:bg-destructive/10">
        <Trash2 className="mr-2 h-4 w-4" />Move to Trash
      </Item>
      <Separator />
      <Item onSelect={actions.onOpenNewTab}>
        <ExternalLink className="mr-2 h-4 w-4" />Open in new tab<Shortcut>Ctrl+Shift+Enter</Shortcut>
      </Item>
      <Item onSelect={actions.onOpenSidePeek}>
        <PanelRightOpen className="mr-2 h-4 w-4" />Open in side peek<Shortcut>Alt+Click</Shortcut>
      </Item>
      <Separator />
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground leading-tight">
        Last edited {timeAgo}
      </div>
    </>
  );
}

const ctxParts: MenuParts = {
  Item: ContextMenuItem as MenuParts["Item"],
  Separator: ContextMenuSeparator as MenuParts["Separator"],
  Shortcut: ContextMenuShortcut as MenuParts["Shortcut"],
  Label: ContextMenuLabel as MenuParts["Label"],
};

const ddParts: MenuParts = {
  Item: DropdownMenuItem as MenuParts["Item"],
  Separator: DropdownMenuSeparator as MenuParts["Separator"],
  Shortcut: DropdownMenuShortcut as MenuParts["Shortcut"],
  Label: DropdownMenuLabel as MenuParts["Label"],
};

// Move-To Dialog
function MoveToDialog({
  open,
  onOpenChange,
  node,
  pages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  node: DbNode;
  pages: DbNode[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const moveMutation = useMutation({
    mutationFn: async (targetId: string | null) => {
      await api.nodes.update(node.id, { parentId: targetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["node-children"] });
      queryClient.invalidateQueries({ queryKey: ["breadcrumbs"] });
      toast("Page moved");
      onOpenChange(false);
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to move", "error");
    },
  });

  const targets = pages.filter((p) => p.id !== node.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Move &ldquo;{node.title || "Untitled"}&rdquo; to</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select a destination page or move to root.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto space-y-0.5 py-2">
          <button
            onClick={() => moveMutation.mutate(null)}
            disabled={node.parentId === null}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
            )}
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground italic">Private (root)</span>
          </button>
          {targets.map((p) => {
            const TargetIcon = nodeIcons[p.type] ?? FileText;
            return (
              <button
                key={p.id}
                onClick={() => moveMutation.mutate(p.id)}
                disabled={p.id === node.parentId}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                )}
              >
                {p.icon ? (
                  <span className="text-sm">{p.icon}</span>
                ) : (
                  <TargetIcon className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="truncate">{p.title || "Untitled"}</span>
              </button>
            );
          })}
          {targets.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No other pages</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RootPagesContext = createContext<DbNode[]>([]);

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
    <RootPagesContext.Provider value={pages}>
      <TooltipProvider delayDuration={400}>
        <div role="tree" className="space-y-0.5">
          {pages.map((page) => (
            <TreeNode key={page.id} node={page} depth={0} />
          ))}
        </div>
      </TooltipProvider>
    </RootPagesContext.Provider>
  );
}

// Tree node
const TreeNode = memo(function TreeNode({
  node,
  depth,
}: {
  node: DbNode;
  depth: number;
}) {
  const allRootPages = useContext(RootPagesContext);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();
  const { toast } = useToast();

  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.title);
  const [moveOpen, setMoveOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const nodeLink = nodeUrl(node.title, node.id);
  const isActive = pathname === nodeLink;
  const Icon = nodeIcons[node.type] ?? FileText;

  const childTypes =
    node.type === "database"
      ? ["page", "database", "database_row"]
      : ["page", "database"];

  const { data: children = [] } = useQuery<DbNode[]>({
    queryKey: ["node-children", node.id, childTypes.join(",")],
    queryFn: async () => {
      return api.nodes.list({
        parentId: node.id,
        type: childTypes.join(","),
        orderBy: "sort_order",
      });
    },
    enabled: expanded,
    staleTime: 30_000,
  });

  const toggleExpand = useCallback(() => setExpanded((prev) => !prev), []);
  const navigate = useCallback(() => router.push(nodeLink), [router, nodeLink]);

  const handleIconChange = useCallback(
    async (emoji: string | null) => {
      await api.nodes.update(node.id, { icon: emoji });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({ queryKey: ["node", node.id] });
      queryClient.invalidateQueries({ queryKey: ["breadcrumbs"] });
    },
    [node.id, queryClient]
  );

  const handleFavorite = useCallback(async () => {
    await api.nodes.update(node.id, { isPinned: !node.isPinned });
    queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    queryClient.invalidateQueries({ queryKey: ["node", node.id] });
    toast(node.isPinned ? "Removed from favorites" : "Added to favorites");
  }, [node.id, node.isPinned, queryClient, toast]);

  const handleCopyLink = useCallback(async () => {
    const url = `${window.location.origin}${nodeLink}`;
    const ok = await copyToClipboard(url);
    toast(ok ? "Link copied to clipboard" : "Failed to copy link");
  }, [nodeLink, toast]);

  const handleDuplicate = useCallback(async () => {
    if (!userId) return;
    const newNode = await api.nodes.create({
      parentId: node.parentId,
      type: node.type,
      title: `${node.title || "Untitled"} (copy)`,
      icon: node.icon,
      content: node.content,
      properties: node.properties,
    });
    queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    queryClient.invalidateQueries({ queryKey: ["node-children"] });
    toast("Page duplicated");
    router.push(nodeUrl((newNode as DbNode).title, (newNode as DbNode).id));
  }, [userId, node, queryClient, toast, router]);

  const startRename = useCallback(() => {
    setRenameValue(node.title);
    setRenaming(true);
  }, [node.title]);

  const commitRename = useCallback(async () => {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === node.title) return;
    await api.nodes.update(node.id, { title: trimmed });
    queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    queryClient.invalidateQueries({ queryKey: ["node", node.id] });
    queryClient.invalidateQueries({ queryKey: ["breadcrumbs"] });
  }, [node.id, node.title, renameValue, queryClient]);

  const handleTrash = useCallback(async () => {
    await api.nodes.delete(node.id);
    queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    queryClient.invalidateQueries({ queryKey: ["node-children"] });
    toast("Moved to trash");
    if (isActive) router.push("/workspace");
  }, [node.id, queryClient, toast, isActive, router]);

  const handleOpenNewTab = useCallback(() => {
    window.open(`${window.location.origin}${nodeLink}`, "_blank");
  }, [nodeLink]);

  const handleOpenSidePeek = useCallback(() => {
    window.open(`${window.location.origin}${nodeLink}`, "_blank", "width=480,height=720");
  }, [nodeLink]);

  const handleAddChild = useCallback(async () => {
    if (!userId) return;
    const newNode = await api.nodes.create({
      parentId: node.id,
      type: "page",
      title: "Untitled",
      content: [],
      properties: {},
    });
    setExpanded(true);
    queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    queryClient.invalidateQueries({ queryKey: ["node-children"] });
    router.push(nodeUrl((newNode as DbNode).title, (newNode as DbNode).id));
  }, [userId, node.id, queryClient, router]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const actions: NodeActions = {
    onFavorite: handleFavorite,
    onCopyLink: handleCopyLink,
    onDuplicate: handleDuplicate,
    onRename: startRename,
    onMoveTo: () => setMoveOpen(true),
    onTrash: handleTrash,
    onOpenNewTab: handleOpenNewTab,
    onOpenSidePeek: handleOpenSidePeek,
    isPinned: node.isPinned,
    updatedAt: node.updatedAt,
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === "d") { e.preventDefault(); handleDuplicate(); }
      if (e.ctrlKey && e.shiftKey && e.key === "R") { e.preventDefault(); startRename(); }
      if (e.ctrlKey && e.shiftKey && e.key === "P") { e.preventDefault(); setMoveOpen(true); }
    },
    [handleDuplicate, startRename]
  );

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group flex min-h-[28px] items-center gap-1 rounded-md px-2 py-[3px] text-[13px] transition-colors duration-150 hover:bg-accent/60",
              isActive && "bg-accent/60 font-medium",
              dropdownOpen && "bg-accent/60"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            <button
              onClick={toggleExpand}
              aria-label={expanded ? "Collapse" : "Expand"}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform duration-150 ease-out", expanded && "rotate-90")} />
            </button>

            <EmojiPicker value={node.icon} onChange={handleIconChange} side="right" align="start">
              <button
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-muted"
                aria-label="Change icon"
                onClick={(e) => e.stopPropagation()}
              >
                {node.icon ? (
                  <span className="text-[13px] leading-none">{node.icon}</span>
                ) : (
                  <Icon className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                )}
              </button>
            </EmojiPicker>

            {renaming ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="flex-1 rounded-sm border bg-background px-1 py-0 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                onClick={navigate}
                onDoubleClick={(e) => { e.preventDefault(); startRename(); }}
                className="flex flex-1 items-center gap-1 truncate"
              >
                <span className="truncate">{node.title || "Untitled"}</span>
                <VisibilityBadge visibility={(node as DbNode & { visibility?: string }).visibility} />
              </button>
            )}

            <div
              className={cn(
                "ml-auto flex items-center gap-0.5 shrink-0",
                dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                "transition-opacity duration-100"
              )}
            >
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Delete, duplicate, and more…"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Delete, duplicate, and more…
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="right" align="start" className="w-56">
                  {renderNodeMenu(ddParts, actions)}
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddChild(); }}
                    className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Add a page inside"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Add a page inside
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56">
          {renderNodeMenu(ctxParts, actions)}
        </ContextMenuContent>
      </ContextMenu>

      <MoveToDialog open={moveOpen} onOpenChange={setMoveOpen} node={node} pages={allRootPages} />

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
