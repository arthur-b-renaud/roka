"use client";

import { memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useRecentPages, usePinnedPages } from "@/lib/queries/nodes";
import { useSetupComplete } from "@/lib/hooks/use-app-settings";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  Database,
  Clock,
  Pin,
  Bot,
  Sparkles,
  GitBranch,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCreateAgentTask } from "@/lib/queries/nodes";
import { nodeUrl } from "@/lib/slug";
import type { DbNode } from "@/lib/types/database";

export default function WorkspacePage() {
  const router = useRouter();
  const { userId } = useCurrentUser();
  useRealtime();

  const { data: recentPages = [], isLoading: loadingRecent } = useRecentPages(userId);
  const { data: pinnedPages = [] } = usePinnedPages(userId);
  const createAgentTask = useCreateAgentTask();
  const { llmConfigured } = useSetupComplete();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-24 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      </div>

      {/* Chat Panel -- replaces the old single-line prompt */}
      {llmConfigured && <ChatPanel />}

      {/* Quick actions */}
      <TooltipProvider>
        <div className="flex gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (recentPages[0]) {
                      createAgentTask.mutate({
                        workflow: "summarize",
                        nodeId: recentPages[0].id,
                      });
                    }
                  }}
                  disabled={recentPages.length === 0 || !llmConfigured}
                >
                  <Sparkles className="h-4 w-4" />
                  Summarize Latest Page
                </Button>
              </span>
            </TooltipTrigger>
            {!llmConfigured && (
              <TooltipContent>
                <p>Configure your LLM in Settings first</p>
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (recentPages[0]) {
                      createAgentTask.mutate({
                        workflow: "triage",
                        nodeId: recentPages[0].id,
                      });
                    }
                  }}
                  disabled={recentPages.length === 0 || !llmConfigured}
                >
                  <GitBranch className="h-4 w-4" />
                  Smart Triage Latest
                </Button>
              </span>
            </TooltipTrigger>
            {!llmConfigured && (
              <TooltipContent>
                <p>Configure your LLM in Settings first</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Pinned pages */}
      {pinnedPages.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Pin className="h-3.5 w-3.5" />
            Pinned
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pinnedPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(nodeUrl(page.title, page.id))} />
            ))}
          </div>
        </section>
      )}

      {/* Recent pages */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Recent
        </h2>
        {loadingRecent ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : recentPages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pages yet. Create one from the sidebar.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recentPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(nodeUrl(page.title, page.id))} />
            ))}
          </div>
        )}
      </section>

      {/* Activity feed */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          Activity
        </h2>
        <ActivityFeed userId={userId} />
      </section>
    </div>
  );
}

const PageCard = memo(function PageCard({ node, onClick }: { node: DbNode; onClick: () => void }) {
  const Icon = node.type === "database" ? Database : FileText;

  return (
    <button
      onClick={onClick}
      aria-label={`Open ${node.title || "Untitled"}`}
      className="flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors duration-150 hover:bg-accent/50"
    >
      <div className="flex items-center gap-2">
        {node.icon ? (
          <span className="text-lg">{node.icon}</span>
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium truncate">
          {node.title || "Untitled"}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(node.updatedAt), { addSuffix: true })}
      </span>
    </button>
  );
});
