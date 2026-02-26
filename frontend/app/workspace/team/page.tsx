"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbToolDefinitionSchema, type DbToolDefinition } from "@/lib/types/agent";
import type { MemberKind } from "@/lib/types/team";
import {
  useTeamMembers,
  useCreateMember,
  useUpdateMember,
  useRemoveMember,
} from "@/lib/hooks/use-team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { Bot, Plus, X, User, Users } from "lucide-react";
import { z } from "zod";
import { MemberCard } from "./member-card";
import { AIAgentForm } from "./ai-agent-form";

const toolsArraySchema = z.array(dbToolDefinitionSchema);

export default function TeamPage() {
  const { toast } = useToast();
  const { data: members = [], isLoading } = useTeamMembers();
  const createMember = useCreateMember();
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();

  const { data: tools = [] } = useQuery<DbToolDefinition[]>({
    queryKey: ["tool-definitions"],
    queryFn: async () => {
      const data = await api.toolDefinitions.list();
      return toolsArraySchema.parse(data);
    },
    staleTime: 30_000,
  });

  const [showForm, setShowForm] = useState(false);
  const [formKind, setFormKind] = useState<MemberKind>("ai");
  const [humanEmail, setHumanEmail] = useState("");
  const [humanPageAccess, setHumanPageAccess] = useState<"all" | "selected">("all");
  const [humanCanWrite, setHumanCanWrite] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const humanMembers = useMemo(() => members.filter((m) => m.kind === "human"), [members]);
  const aiMembers = useMemo(() => members.filter((m) => m.kind === "ai"), [members]);

  const handleCreateHuman = useCallback(() => {
    createMember.mutate(
      { kind: "human", email: humanEmail, pageAccess: humanPageAccess, canWrite: humanCanWrite },
      {
        onSuccess: () => {
          setShowForm(false);
          setHumanEmail("");
          setHumanPageAccess("all");
          setHumanCanWrite(true);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "Failed", "error"),
      },
    );
  }, [humanEmail, humanPageAccess, humanCanWrite, createMember, toast]);

  const handleCreateAI = useCallback(
    (data: Parameters<typeof createMember.mutate>[0]) => {
      createMember.mutate(data, {
        onSuccess: () => setShowForm(false),
        onError: (err) => toast(err instanceof Error ? err.message : "Failed", "error"),
      });
    },
    [createMember, toast],
  );

  const handleSave = useCallback(
    (id: string, data: Record<string, unknown>) => {
      updateMember.mutate(
        { id, ...data } as Parameters<typeof updateMember.mutate>[0],
        {
          onError: (err) => toast(err instanceof Error ? err.message : "Failed", "error"),
        },
      );
    },
    [updateMember, toast],
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeMember.mutate(id, {
        onError: (err) => toast(err instanceof Error ? err.message : "Failed", "error"),
      });
    },
    [removeMember, toast],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="h-6 w-6" />
            Team
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage workspace members — both humans and AI agents — in one place.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add Member"}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-lg border p-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormKind("ai")}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                formKind === "ai" ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent/50"
              }`}
            >
              <Bot className="h-4 w-4" /> AI Agent
            </button>
            <button
              type="button"
              onClick={() => setFormKind("human")}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                formKind === "human" ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent/50"
              }`}
            >
              <User className="h-4 w-4" /> Invite Human
            </button>
          </div>

          {formKind === "human" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={humanEmail}
                  onChange={(e) => setHumanEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  type="email"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Page Access</Label>
                  <select
                    className="h-7 rounded-md border bg-background px-2 text-xs"
                    value={humanPageAccess}
                    onChange={(e) => setHumanPageAccess(e.target.value as "all" | "selected")}
                  >
                    <option value="all">All pages</option>
                    <option value="selected">Selected pages</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Can Write</Label>
                  <Switch checked={humanCanWrite} onCheckedChange={setHumanCanWrite} />
                </div>
              </div>
              <Button onClick={handleCreateHuman} disabled={!humanEmail.trim() || createMember.isPending}>
                {createMember.isPending ? "Inviting..." : "Invite"}
              </Button>
            </div>
          ) : (
            <AIAgentForm tools={tools} isPending={createMember.isPending} onSubmit={handleCreateAI} />
          )}
        </div>
      )}

      <Separator />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading team...</p>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No team members yet</p>
          <p className="mt-1">Add humans or AI agents to your workspace.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {aiMembers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  AI Agents ({aiMembers.length})
                </span>
              </div>
              <div className="space-y-2">
                {aiMembers.map((m) => (
                  <MemberCard
                    key={m.id}
                    member={m}
                    tools={tools}
                    isExpanded={expandedId === m.id}
                    onToggleExpand={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    onSave={handleSave}
                    onRemove={handleRemove}
                    isSaving={updateMember.isPending}
                  />
                ))}
              </div>
            </div>
          )}
          {humanMembers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Humans ({humanMembers.length})
                </span>
              </div>
              <div className="space-y-2">
                {humanMembers.map((m) => (
                  <MemberCard
                    key={m.id}
                    member={m}
                    tools={tools}
                    isExpanded={expandedId === m.id}
                    onToggleExpand={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    onSave={handleSave}
                    onRemove={handleRemove}
                    isSaving={updateMember.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
