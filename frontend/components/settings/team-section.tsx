"use client";

import { useState } from "react";
import {
  useTeam,
  useTeamMembers,
  useInviteExistingMember,
  useUpdateMemberRole,
  useRemoveMember,
  useUpdateTeamName,
} from "@/lib/hooks/use-team";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, UserPlus, ChevronDown, Trash2, Pencil, Check, X } from "lucide-react";
import type { TeamRole } from "@/lib/types/team";

function roleBadgeVariant(role: TeamRole) {
  if (role === "owner") return "default" as const;
  if (role === "admin") return "secondary" as const;
  return "outline" as const;
}

export function TeamSection() {
  const { userId } = useCurrentUser();
  const { data: team, isLoading: teamLoading } = useTeam();
  const { data: members = [], isLoading: membersLoading } = useTeamMembers();
  const inviteMember = useInviteExistingMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const updateTeamName = useUpdateTeamName();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const myRole = team?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    try {
      await inviteMember.mutateAsync(inviteEmail.trim());
      setInviteEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    }
  };

  const handleRoleChange = (memberId: string, role: string) => {
    updateRole.mutate({ id: memberId, role });
  };

  const handleRemove = (memberId: string) => {
    removeMember.mutate(memberId);
  };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    await updateTeamName.mutateAsync(nameValue.trim());
    setEditingName(false);
  };

  if (teamLoading || membersLoading) {
    return (
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-4 w-4" />
          Team
        </h2>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-4 w-4" />
          Team
        </h2>
        <Badge variant={roleBadgeVariant(myRole ?? "member")}>
          {myRole}
        </Badge>
      </div>

      {/* Team name */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Workspace name</Label>
        {editingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="max-w-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setEditingName(false);
              }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{team?.name}</span>
            {canManage && (
              <button
                onClick={() => {
                  setNameValue(team?.name ?? "");
                  setEditingName(true);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Member list */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Members ({members.length})
        </Label>
        <div className="divide-y rounded-md border">
          {members.map((member) => {
            const isMe = member.userId === userId;
            const isMemberOwner = member.role === "owner";

            return (
              <div
                key={member.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                  {(member.name?.[0] ?? member.email[0])}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">
                    {member.name || member.email}
                    {isMe && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  {member.name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  )}
                </div>

                {canManage && !isMemberOwner && !isMe ? (
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                          {member.role}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRoleChange(member.id, "admin")}>
                          Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRoleChange(member.id, "member")}>
                          Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(member.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant={roleBadgeVariant(member.role)} className="text-[10px]">
                    {member.role}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite form */}
      {canManage && (
        <form onSubmit={handleInvite} className="space-y-2">
          <Label className="text-xs text-muted-foreground">Add team member</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                if (inviteError) setInviteError(null);
              }}
              placeholder="Email of a registered user"
              className="max-w-sm"
              required
            />
            <Button
              type="submit"
              size="sm"
              disabled={inviteMember.isPending || !inviteEmail.trim()}
              className="gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {inviteMember.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
          {inviteError && (
            <p className="text-sm text-destructive">{inviteError}</p>
          )}
        </form>
      )}
    </section>
  );
}
