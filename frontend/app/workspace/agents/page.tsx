"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbAgentDefinitionSchema, dbToolDefinitionSchema, type DbAgentDefinition, type DbToolDefinition } from "@/lib/types/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Plus,
  X,
  Play,
  Clock,
  Zap,
  Wrench,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";

const agentsArraySchema = z.array(dbAgentDefinitionSchema);
const toolsArraySchema = z.array(dbToolDefinitionSchema);

const triggerIcons: Record<string, React.ReactNode> = {
  manual: <Play className="h-3.5 w-3.5" />,
  schedule: <Clock className="h-3.5 w-3.5" />,
  event: <Zap className="h-3.5 w-3.5" />,
};

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    model: "",
    trigger: "manual" as "manual" | "schedule" | "event",
    triggerConfig: "",
    toolIds: [] as string[],
  });

  const { data: agents = [], isLoading } = useQuery<DbAgentDefinition[]>({
    queryKey: ["agent-definitions"],
    queryFn: async () => {
      const data = await api.agentDefinitions.list();
      return agentsArraySchema.parse(data);
    },
    staleTime: 30_000,
  });

  const { data: tools = [] } = useQuery<DbToolDefinition[]>({
    queryKey: ["tool-definitions"],
    queryFn: async () => {
      const data = await api.toolDefinitions.list();
      return toolsArraySchema.parse(data);
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let triggerConfig = {};
      if (form.triggerConfig.trim()) {
        try {
          triggerConfig = JSON.parse(form.triggerConfig);
        } catch { /* ignore */ }
      }
      return api.agentDefinitions.create({
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        model: form.model,
        toolIds: form.toolIds,
        trigger: form.trigger,
        triggerConfig,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-definitions"] });
      setShowForm(false);
      setForm({ name: "", description: "", systemPrompt: "", model: "", trigger: "manual", triggerConfig: "", toolIds: [] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.agentDefinitions.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-definitions"] }),
  });

  const toggleTool = (toolId: string) => {
    setForm((prev) => ({
      ...prev,
      toolIds: prev.toolIds.includes(toolId)
        ? prev.toolIds.filter((t) => t !== toolId)
        : [...prev.toolIds, toolId],
    }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bot className="h-6 w-6" />
            Agents
          </h1>
          <p className="mt-1 text-muted-foreground">
            Configurable AI agents. Each agent has its own persona, tools, and trigger.
          </p>
        </div>
        <Button
          className="gap-1.5"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "New Agent"}
        </Button>
      </div>

      {/* Create agent form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Create Agent</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sales Assistant"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-model">Model (blank = workspace default)</Label>
              <Input
                id="agent-model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="gpt-4o"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-desc">Description</Label>
            <Input
              id="agent-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Helps with sales outreach and client follow-ups"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-prompt">System Prompt</Label>
            <textarea
              id="agent-prompt"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="You are a sales assistant. You help find and contact potential clients..."
              className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Trigger</Label>
            <div className="flex gap-2">
              {(["manual", "schedule", "event"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, trigger: t })}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    form.trigger === t ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent/50"
                  }`}
                >
                  {triggerIcons[t]}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {form.trigger !== "manual" && (
            <div className="space-y-2">
              <Label htmlFor="agent-trigger-config">
                Trigger Config (JSON)
              </Label>
              <Input
                id="agent-trigger-config"
                value={form.triggerConfig}
                onChange={(e) => setForm({ ...form, triggerConfig: e.target.value })}
                placeholder={form.trigger === "schedule" ? '{"cron": "0 9 * * MON"}' : '{"event": "communication.inbound"}'}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Tools (empty = all available)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {tools.filter((t) => t.isActive).map((tool) => (
                <label
                  key={tool.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    form.toolIds.includes(tool.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.toolIds.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="rounded"
                  />
                  {tool.displayName}
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={() => createMutation.mutate()}
            disabled={!form.name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Agent"}
          </Button>
        </div>
      )}

      <Separator />

      {/* Agent list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading agents...</p>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Bot className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No agents configured</p>
          <p className="mt-1">Create an agent to give the AI a specific persona and tool set.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{agent.name}</h3>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1 text-xs">
                    {triggerIcons[agent.trigger]}
                    {agent.trigger}
                  </Badge>
                  {agent.model && (
                    <Badge variant="secondary" className="text-xs">{agent.model}</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(agent.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {agent.systemPrompt && (
                <p className="text-xs text-muted-foreground/80 line-clamp-2 pl-11 font-mono">
                  {agent.systemPrompt}
                </p>
              )}
              <div className="flex items-center gap-2 pl-11">
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })}
                </span>
                {agent.toolIds && agent.toolIds.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {agent.toolIds.length} tool{agent.toolIds.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
