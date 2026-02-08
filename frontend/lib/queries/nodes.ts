import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { dbNodeSchema, type DbNode, type DbAgentTask } from "@/lib/types/database";
import { z } from "zod";

const nodesArraySchema = z.array(dbNodeSchema);

export function useRecentPages(userId: string | null) {
  const supabase = useSupabase();
  return useQuery<DbNode[]>({
    queryKey: ["recent-pages", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("owner_id", userId)
        .in("type", ["page", "database"])
        .is("parent_id", null)
        .order("updated_at", { ascending: false })
        .limit(9);
      if (error) throw error;
      return nodesArraySchema.parse(data);
    },
    enabled: !!userId,
    staleTime: 10_000,
  });
}

export function usePinnedPages(userId: string | null) {
  const supabase = useSupabase();
  return useQuery<DbNode[]>({
    queryKey: ["pinned-pages", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("owner_id", userId)
        .eq("is_pinned", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return nodesArraySchema.parse(data);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useCreateAgentTask() {
  const supabase = useSupabase();
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const input: Record<string, unknown> = {};
      if (nodeId) input.node_id = nodeId;
      if (prompt) input.prompt = prompt;

      const { error } = await supabase.from("agent_tasks").insert({
        owner_id: user.id,
        workflow,
        node_id: nodeId ?? null,
        input,
      });
      if (error) throw error;
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
        owner_id: userId ?? "",
        workflow,
        status: "pending",
        input,
        output: null,
        error: null,
        node_id: nodeId ?? null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<DbAgentTask[]>(
        ["agent-tasks", userId],
        (old) => [optimisticTask, ...(old ?? [])],
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(["agent-tasks", userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
    },
  });
}
