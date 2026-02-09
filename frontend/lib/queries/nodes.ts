import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { dbNodeSchema, type DbNode, type DbAgentTask } from "@/lib/types/database";
import { api } from "@/lib/api";
import { z } from "zod";

const nodesArraySchema = z.array(dbNodeSchema);

export function useRecentPages(userId: string | null) {
  return useQuery<DbNode[]>({
    queryKey: ["recent-pages", userId],
    queryFn: async () => {
      if (!userId) return [];
      const data = await api.nodes.list({
        type: "page,database",
        parentId: "null",
        orderBy: "updated_at",
        limit: "9",
      });
      return nodesArraySchema.parse(data);
    },
    enabled: !!userId,
    staleTime: 10_000,
  });
}

export function usePinnedPages(userId: string | null) {
  return useQuery<DbNode[]>({
    queryKey: ["pinned-pages", userId],
    queryFn: async () => {
      if (!userId) return [];
      const data = await api.nodes.list({
        pinned: "true",
        orderBy: "sort_order",
      });
      return nodesArraySchema.parse(data);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useCreateAgentTask() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();

  return useMutation({
    mutationFn: async ({
      workflow,
      nodeId,
      prompt,
    }: {
      workflow: "summarize" | "triage" | "agent";
      nodeId?: string;
      prompt?: string;
    }) => {
      const input: Record<string, unknown> = {};
      if (prompt) input.prompt = prompt;

      await api.agentTasks.create({
        workflow,
        nodeId: nodeId ?? null,
        input,
      });
    },
    // Optimistic update: show the task immediately as "pending"
    onMutate: async ({ workflow, nodeId, prompt }) => {
      await queryClient.cancelQueries({ queryKey: ["agent-tasks", userId] });
      const previous = queryClient.getQueryData<DbAgentTask[]>(["agent-tasks", userId]);

      const input: Record<string, unknown> = {};
      if (nodeId) input.node_id = nodeId;
      if (prompt) input.prompt = prompt;

      const optimisticTask: DbAgentTask = {
        id: crypto.randomUUID(),
        ownerId: userId ?? "",
        workflow,
        status: "pending",
        input,
        output: null,
        error: null,
        nodeId: nodeId ?? null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<DbAgentTask[]>(
        ["agent-tasks", userId],
        (old) => [optimisticTask, ...(old ?? [])],
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["agent-tasks", userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
    },
  });
}
