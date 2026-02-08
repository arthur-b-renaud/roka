"use client";

import { memo, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useRecentPages, usePinnedPages, useCreateAgentTask } from "@/lib/queries/nodes";
import { useSetupComplete } from "@/lib/hooks/use-app-settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
// Separator removed for cleaner visual hierarchy
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
  Send,
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
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
  }), []);

  const { llmConfigured } = useSetupComplete();
  const [agentPrompt, setAgentPrompt] = useState("");

  const handleAgentSubmit = () => {
    const trimmed = agentPrompt.trim();
    if (!trimmed) return;
    createAgentTask.mutate({
      workflow: "agent",
      prompt: trimmed,
      nodeId: recentPages[0]?.id,
    });
    setAgentPrompt("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-24 py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      </div>

      {/* Agent Prompt */}
      {llmConfigured && (
        <section className="rounded-lg border px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAgentSubmit();
                }
              }}
              placeholder="Ask the agent..."
              className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 text-sm"
            />
            <Button
              onClick={handleAgentSubmit}
              disabled={!agentPrompt.trim() || createAgentTask.isPending}
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </section>
      )}

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
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Pin className="h-3.5 w-3.5" />
            Pinned
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pinnedPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(`/workspace/${page.id}`)} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Pages */}
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
              <PageCard key={page.id} node={page} onClick={() => router.push(`/workspace/${page.id}`)} />
            ))}
          </div>
        )}
      </section>

      {/* Agent Tasks */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
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
                className="rounded-lg border px-4 py-3 transition-colors duration-150"
              >
                <div className="flex items-center justify-between">
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
                {task.workflow === "agent" && task.input?.prompt && (
                  <p className="mt-1.5 text-xs text-muted-foreground truncate">
                    {String(task.input.prompt)}
                  </p>
                )}
                {task.status === "completed" && task.output?.response && (
                  <p className="mt-1.5 text-sm text-foreground/80 line-clamp-2">
                    {String(task.output.response)}
                  </p>
                )}
                {task.status === "failed" && task.error && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 truncate">
                    {task.error}
                  </p>
                )}
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
        {formatDistanceToNow(new Date(node.updated_at), { addSuffix: true })}
      </span>
    </button>
  );
});
