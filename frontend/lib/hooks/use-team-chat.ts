import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbTeamMessageSchema, type DbTeamMessage } from "@/lib/types/team";
import { z } from "zod";

const messagesArraySchema = z.array(dbTeamMessageSchema);

export function useTeamMessages() {
  return useQuery<DbTeamMessage[]>({
    queryKey: ["team-messages"],
    queryFn: async () => {
      const data = await api.teamMessages.list(100);
      return messagesArraySchema.parse(data);
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

export function useSendTeamMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => api.teamMessages.send(content),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ["team-messages"] });
      const previous = queryClient.getQueryData<DbTeamMessage[]>(["team-messages"]);

      const optimistic: DbTeamMessage = {
        id: crypto.randomUUID(),
        teamId: "",
        userId: "",
        content,
        createdAt: new Date().toISOString(),
        userName: "You",
        userEmail: "",
        userImage: null,
      };

      queryClient.setQueryData<DbTeamMessage[]>(
        ["team-messages"],
        (old) => [...(old ?? []), optimistic],
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["team-messages"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["team-messages"] });
    },
  });
}
