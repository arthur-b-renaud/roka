import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  dbTeamSchema,
  dbTeamMemberSchema,
  type DbTeam,
  type DbTeamMember,
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

export function useInviteExistingMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) => api.teamMembers.invite(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.teamMembers.updateRole(id, role),
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
