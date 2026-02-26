import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  dbTeamSchema,
  dbTeamMemberSchema,
  type DbTeam,
  type DbTeamMember,
  type CreateMemberInput,
  type UpdateMemberInput,
} from "@/lib/types/team";
import { z } from "zod";

const membersArraySchema = z.array(dbTeamMemberSchema);

export function useTeam() {
  return useQuery<DbTeam>({
    queryKey: ["team"],
    queryFn: async () => {
      const data = await api.teams.get();
      return dbTeamSchema.parse(data);
    },
    staleTime: 60_000,
  });
}

export function useTeamMembers() {
  return useQuery<DbTeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const data = await api.teamMembers.list();
      return membersArraySchema.parse(data);
    },
    staleTime: 30_000,
  });
}

export function useTeamRole() {
  const { data: team } = useTeam();
  return team?.role ?? null;
}

export function useCreateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMemberInput) => api.teamMembers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateMemberInput & { id: string }) =>
      api.teamMembers.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.teamMembers.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useUpdateTeamName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.teams.update({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
