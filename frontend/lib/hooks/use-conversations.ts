import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbConversationSchema, dbMessageSchema, type DbConversation, type DbMessage } from "@/lib/types/agent";
import { z } from "zod";

const conversationsArraySchema = z.array(dbConversationSchema);
const messagesArraySchema = z.array(dbMessageSchema);

export function useConversations(userId: string | null) {
  return useQuery<DbConversation[]>({
    queryKey: ["conversations", userId],
    queryFn: async () => {
      if (!userId) return [];
      const data = await api.conversations.list();
      return conversationsArraySchema.parse(data);
    },
    enabled: !!userId,
    staleTime: 10_000,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery<DbMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const data = await api.conversations.messages(conversationId);
      return messagesArraySchema.parse(data);
    },
    enabled: !!conversationId,
    staleTime: 5_000,
    refetchInterval: 3_000, // Poll for new messages while conversation is active
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { title?: string; agentDefinitionId?: string | null }) => {
      const result = await api.conversations.create(data);
      return dbConversationSchema.parse(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { content: string; agentDefinitionId?: string | null }) => {
      return api.conversations.sendMessage(conversationId, data);
    },
    // Optimistic: add user message immediately
    onMutate: async ({ content }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const previous = queryClient.getQueryData<DbMessage[]>(["messages", conversationId]);

      const optimisticMsg: DbMessage = {
        id: crypto.randomUUID(),
        conversationId,
        role: "user",
        content,
        metadata: {},
        taskId: null,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<DbMessage[]>(
        ["messages", conversationId],
        (old) => [...(old ?? []), optimisticMsg],
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["messages", conversationId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
    },
  });
}
