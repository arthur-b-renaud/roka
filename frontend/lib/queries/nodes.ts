import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { DbNode } from "@/lib/types/database";

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
      return data as DbNode[];
    },
    enabled: !!userId,
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
      return data as DbNode[];
    },
    enabled: !!userId,
  });
}

export function useCreateAgentTask() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workflow,
      nodeId,
    }: {
      workflow: "summarize" | "triage";
      nodeId: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("agent_tasks").insert({
        owner_id: user.id,
        workflow,
        node_id: nodeId,
        input: { node_id: nodeId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
    },
  });
}
