"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useTeam,
  useTeamMembers,
  useUpdateTeamName,
} from "@/lib/hooks/use-team";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, Pencil, Check, X, ExternalLink, Bot } from "lucide-react";
import type { TeamRole } from "@/lib/types/team";

function roleBadgeVariant(role: TeamRole) {
  if (role === "owner") return "default" as const;
  if (role === "admin") return "secondary" as const;
  return "outline" as const;
}

export function TeamSection() {
  const router = useRouter();
  const { userId } = useCurrentUser();
  const { data: team, isLoading: teamLoading } = useTeam();
  const { data: members = [], isLoading: membersLoading } = useTeamMembers();
  const updateTeamName = useUpdateTeamName();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const myRole = team?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const humanCount = members.filter((m) => m.kind === "human").length;
  const aiCount = members.filter((m) => m.kind === "ai").length;

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
        <div className="flex items-center gap-2">
          <Badge variant={roleBadgeVariant(myRole ?? "member")}>
            {myRole}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => router.push("/workspace/team")}
          >
            <ExternalLink className="h-3 w-3" />
            Manage Team
          </Button>
        </div>
      </div>

      {/* Workspace name */}
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

      {/* Summary */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {humanCount} human{humanCount !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          {aiCount} AI agent{aiCount !== 1 ? "s" : ""}
        </div>
      </div>
    </section>
  );
}
