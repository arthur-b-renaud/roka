"use client";

import { memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useRecentPages, usePinnedPages, useCreateAgentTask } from "@/lib/queries/nodes";
import { useSetupComplete } from "@/lib/hooks/use-app-settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { dbAgentTaskSchema, type DbNode, type DbAgentTask } from "@/lib/types/database";
import { z } from "zod";

const agentTasksArraySchema = z.array(dbAgentTaskSchema);

export default function WorkspacePage() {
  const router = useRouter();
  const supabase = useSupabase();
  const { userId } = useCurrentUser();

  const { data: recentPages = [], isLoading: loadingRecent } = useRecentPages(userId);
  const { data: pinnedPages = [] } = usePinnedPages(userId);
  const createAgentTask = useCreateAgentTask();

  // Fetch agent tasks with Supabase Realtime subscription
  const { data: agentTasks = [] } = useQuery<DbAgentTask[]>({
    queryKey: ["agent-tasks", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("agent_tasks")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return agentTasksArraySchema.parse(data);
    },
    enabled: !!userId,
    refetchInterval: 10_000, // light fallback; realtime handles most updates
  });

  const statusColors: Record<string, string> = useMemo(() => ({
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
  }), []);

  const { llmConfigured } = useSetupComplete();

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Home</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome to your workspace
        </p>
      </div>

      {/* Quick Actions */}
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

      {/* Pinned Pages */}
      {pinnedPages.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Pin className="h-4 w-4" />
            Pinned
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pinnedPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(`/workspace/${page.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Pages */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Clock className="h-4 w-4" />
          Recent
        </h2>
        {loadingRecent ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : recentPages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pages yet. Create one from the sidebar.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recentPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(`/workspace/${page.id}`)} />
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Agent Tasks */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Bot className="h-4 w-4" />
          Agent Tasks
        </h2>
        {agentTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agent tasks yet. Trigger one above.
          </p>
        ) : (
          <div className="space-y-2">
            {agentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={`${statusColors[task.status] ?? ""} border-0 text-xs`}
                  >
                    {task.status}
                  </Badge>
                  <span className="text-sm font-medium capitalize">
                    {task.workflow}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
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
      className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent/50"
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
        {formatDistanceToNow(new Date(node.updated_at), { addSuffix: true })}
      </span>
    </button>
  );
});
