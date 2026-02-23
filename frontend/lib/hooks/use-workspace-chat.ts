import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { dbChatChannelSchema, dbChatMessageSchema, type DbChatChannel, type DbChatMessage } from "@/lib/types/team";

const channelsListSchema = z.object({
  channels: z.array(dbChatChannelSchema),
  directs: z.array(dbChatChannelSchema),
});

const chatMessagesSchema = z.array(dbChatMessageSchema);

export function useWorkspaceChatChannels() {
  return useQuery<{ channels: DbChatChannel[]; directs: DbChatChannel[] }>({
    queryKey: ["workspace-chat-channels"],
    queryFn: async () => {
      const data = await api.chatChannels.list();
      return channelsListSchema.parse(data);
    },
    staleTime: 10_000,
  });
}

export function useWorkspaceChatMessages(channelId: string | null) {
  return useQuery<DbChatMessage[]>({
    queryKey: ["workspace-chat-messages", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const data = await api.chatChannels.messages(channelId);
      return chatMessagesSchema.parse(data);
    },
    enabled: !!channelId,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useCreateWorkspaceChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.chatChannels.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-chat-channels"] });
    },
  });
}

export function useCreateWorkspaceDirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (otherUserId: string) => api.chatChannels.createDirect(otherUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-chat-channels"] });
    },
  });
}

export function useSendWorkspaceChatMessage(channelId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => {
      if (!channelId) throw new Error("No active channel selected");
      return api.chatChannels.sendMessage(channelId, content);
    },
    onMutate: async (content) => {
      if (!channelId) return { previous: undefined as DbChatMessage[] | undefined };
      await queryClient.cancelQueries({ queryKey: ["workspace-chat-messages", channelId] });
      const previous = queryClient.getQueryData<DbChatMessage[]>(["workspace-chat-messages", channelId]);

      const optimistic: DbChatMessage = {
        id: crypto.randomUUID(),
        channelId,
        userId: "",
        content,
        createdAt: new Date().toISOString(),
        userName: "You",
        userEmail: "",
        userImage: null,
      };

      queryClient.setQueryData<DbChatMessage[]>(
        ["workspace-chat-messages", channelId],
        (old) => [...(old ?? []), optimistic],
      );

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (channelId && context?.previous) {
        queryClient.setQueryData(["workspace-chat-messages", channelId], context.previous);
      }
    },
    onSettled: () => {
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ["workspace-chat-messages", channelId] });
      }
      queryClient.invalidateQueries({ queryKey: ["workspace-chat-channels"] });
    },
  });
}
