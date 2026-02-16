"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbAgentTaskSchema, type DbAgentTask } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Sparkles, GitBranch, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";

const agentTasksArraySchema = z.array(dbAgentTaskSchema);

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
};

const workflowIcons: Record<string, React.ReactNode> = {
  agent: <MessageSquare className="h-3.5 w-3.5" />,
  summarize: <Sparkles className="h-3.5 w-3.5" />,
  triage: <GitBranch className="h-3.5 w-3.5" />,
  custom: <Bot className="h-3.5 w-3.5" />,
};

interface ActivityFeedProps {
  userId: string | null;
}

export function ActivityFeed({ userId }: ActivityFeedProps) {
  const { data: tasks = [] } = useQuery<DbAgentTask[]>({
    queryKey: ["agent-tasks", userId],
    queryFn: async () => {
      if (!userId) return [];
      const data = await api.agentTasks.list(15);
      return agentTasksArraySchema.parse(data);
    },
    enabled: !!userId,
    staleTime: 10_000,
  });

  if (tasks.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        No activity yet. Start a conversation or trigger a workflow.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="rounded-lg border px-4 py-3 transition-colors duration-150"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                {workflowIcons[task.workflow] || <Bot className="h-3.5 w-3.5" />}
              </div>
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
              {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
            </span>
          </div>
          {task.workflow === "agent" && task.input?.prompt != null ? (
            <p className="mt-1.5 text-xs text-muted-foreground truncate pl-8">
              {String(task.input.prompt)}
            </p>
          ) : null}
          {task.status === "completed" && task.output?.response != null ? (
            <p className="mt-1.5 text-sm text-foreground/80 line-clamp-2 pl-8">
              {String(task.output.response)}
            </p>
          ) : null}
          {task.status === "failed" && task.error && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 truncate pl-8">
              {task.error}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
