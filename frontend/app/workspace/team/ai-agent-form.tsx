"use client";

import { useState } from "react";
import type { DbToolDefinition } from "@/lib/types/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Play, Clock, Zap, Wrench } from "lucide-react";

const triggerIcons: Record<string, React.ReactNode> = {
  manual: <Play className="h-3.5 w-3.5" />,
  schedule: <Clock className="h-3.5 w-3.5" />,
  event: <Zap className="h-3.5 w-3.5" />,
};

const defaultForm = {
  displayName: "",
  description: "",
  systemPrompt: "",
  model: "",
  trigger: "manual" as "manual" | "schedule" | "event",
  triggerConfig: "",
  toolIds: [] as string[],
  pageAccess: "all" as "all" | "selected",
  canWrite: true,
};

interface AIAgentFormProps {
  tools: DbToolDefinition[];
  isPending: boolean;
  onSubmit: (data: {
    kind: "ai";
    displayName: string;
    description: string;
    systemPrompt: string;
    model: string;
    trigger: "manual" | "schedule" | "event";
    triggerConfig: Record<string, unknown>;
    toolIds: string[];
    pageAccess: "all" | "selected";
    canWrite: boolean;
  }) => void;
}

export function AIAgentForm({ tools, isPending, onSubmit }: AIAgentFormProps) {
  const [form, setForm] = useState(defaultForm);

  const toggleTool = (toolId: string) => {
    setForm((prev) => ({
      ...prev,
      toolIds: prev.toolIds.includes(toolId)
        ? prev.toolIds.filter((t) => t !== toolId)
        : [...prev.toolIds, toolId],
    }));
  };

  const handleSubmit = () => {
    let triggerConfig: Record<string, unknown> = {};
    if (form.triggerConfig.trim()) {
      try { triggerConfig = JSON.parse(form.triggerConfig); } catch { /* ignore */ }
    }
    onSubmit({
      kind: "ai",
      displayName: form.displayName,
      description: form.description,
      systemPrompt: form.systemPrompt,
      model: form.model,
      toolIds: form.toolIds,
      trigger: form.trigger,
      triggerConfig,
      pageAccess: form.pageAccess,
      canWrite: form.canWrite,
    });
    setForm(defaultForm);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Sales Assistant"
          />
        </div>
        <div className="space-y-2">
          <Label>Model (blank = default)</Label>
          <Input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="gpt-4o"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Helps with sales outreach and follow-ups"
        />
      </div>
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          placeholder="You are a sales assistant..."
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
          <Label>Trigger Config (JSON)</Label>
          <Input
            value={form.triggerConfig}
            onChange={(e) => setForm({ ...form, triggerConfig: e.target.value })}
            placeholder={form.trigger === "schedule" ? '{"cron": "0 9 * * MON"}' : '{"event": "communication.inbound"}'}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" />
          Tools <span className="text-muted-foreground font-normal text-xs">(empty = all)</span>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {tools.filter((t) => t.isActive).map((tool) => (
            <label
              key={tool.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                form.toolIds.includes(tool.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50"
              }`}
            >
              <input type="checkbox" checked={form.toolIds.includes(tool.id)} onChange={() => toggleTool(tool.id)} className="rounded" />
              {tool.displayName}
              <Badge variant="outline" className="ml-auto text-[9px]">{tool.type}</Badge>
            </label>
          ))}
        </div>
      </div>
      <Separator />
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Permissions</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Page Access</Label>
            <select
              className="h-7 rounded-md border bg-background px-2 text-xs"
              value={form.pageAccess}
              onChange={(e) => setForm({ ...form, pageAccess: e.target.value as "all" | "selected" })}
            >
              <option value="all">All pages</option>
              <option value="selected">Selected pages</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Can Write</Label>
            <Switch checked={form.canWrite} onCheckedChange={(v) => setForm({ ...form, canWrite: v })} />
          </div>
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={!form.displayName.trim() || isPending}>
        {isPending ? "Creating..." : "Create AI Agent"}
      </Button>
    </div>
  );
}
