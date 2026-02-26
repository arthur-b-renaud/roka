"use client";

import { useCallback, useState } from "react";
import type { DbTeamMember } from "@/lib/types/team";
import type { DbToolDefinition } from "@/lib/types/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Play,
  Clock,
  Zap,
  Wrench,
  Trash2,
  ChevronDown,
  ChevronRight,
  Shield,
  Pencil,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const triggerIcons: Record<string, React.ReactNode> = {
  manual: <Play className="h-3.5 w-3.5" />,
  schedule: <Clock className="h-3.5 w-3.5" />,
  event: <Zap className="h-3.5 w-3.5" />,
};

interface MemberCardProps {
  member: DbTeamMember;
  tools: DbToolDefinition[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSave: (id: string, data: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  isSaving: boolean;
}

export function MemberCard({
  member,
  tools,
  isExpanded,
  onToggleExpand,
  onSave,
  onRemove,
  isSaving,
}: MemberCardProps) {
  const isAi = member.kind === "ai";
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  const startEdit = useCallback(() => {
    setIsEditing(true);
    setEditForm({
      displayName: member.displayName,
      description: member.description,
      systemPrompt: member.systemPrompt,
      model: member.model,
      toolIds: member.toolIds,
      trigger: member.trigger,
      triggerConfig: JSON.stringify(member.triggerConfig),
      pageAccess: member.pageAccess,
      canWrite: member.canWrite,
      isActive: member.isActive,
    });
  }, [member]);

  const handleSave = useCallback(() => {
    let triggerConfig = {};
    const raw = editForm.triggerConfig as string;
    if (raw?.trim()) {
      try { triggerConfig = JSON.parse(raw); } catch { /* ignore */ }
    }
    onSave(member.id, { ...editForm, triggerConfig });
    setIsEditing(false);
  }, [editForm, member.id, onSave]);

  const toggleEditTool = useCallback((toolId: string) => {
    setEditForm((prev) => {
      const current = (prev.toolIds as string[]) || [];
      return {
        ...prev,
        toolIds: current.includes(toolId)
          ? current.filter((t) => t !== toolId)
          : [...current, toolId],
      };
    });
  }, []);

  return (
    <div className="rounded-lg border">
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={onToggleExpand}
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
          isAi
            ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300"
            : "bg-primary/10 text-primary"
        }`}>
          {isAi ? <Bot className="h-4 w-4" /> : (member.displayName?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{member.displayName}</h3>
            <Badge variant={isAi ? "secondary" : "outline"} className="text-[10px] shrink-0">
              {isAi ? "AI" : "Human"}
            </Badge>
            <Badge variant="outline" className="text-[10px] shrink-0">{member.role}</Badge>
            {isAi && !member.isActive && (
              <Badge variant="destructive" className="text-[10px]">inactive</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {member.description && (
              <p className="truncate text-xs text-muted-foreground">{member.description}</p>
            )}
            {!isAi && member.email && (
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAi && (
            <>
              <Badge variant="outline" className="gap-1 text-[10px]">
                {triggerIcons[member.trigger]}
                {member.trigger}
              </Badge>
              {member.model && (
                <Badge variant="secondary" className="text-[10px]">{member.model}</Badge>
              )}
            </>
          )}
          <div className="flex items-center gap-0.5 text-muted-foreground">
            {member.canWrite ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {member.pageAccess === "selected" && <Shield className="h-3 w-3" />}
          </div>
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {!isEditing ? (
            <>
              {isAi && member.systemPrompt && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">System Prompt</p>
                  <p className="text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap line-clamp-4">{member.systemPrompt}</p>
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>Joined {formatDistanceToNow(new Date(member.createdAt), { addSuffix: true })}</span>
                <span>Access: {member.pageAccess === "all" ? "All pages" : "Selected pages"}</span>
                <span>{member.canWrite ? "Read & Write" : "Read only"}</span>
                {isAi && member.toolIds && member.toolIds.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Wrench className="h-3 w-3" />
                    {member.toolIds.map((tid) => {
                      const t = tools.find((tool) => tool.id === tid);
                      return (
                        <Badge key={tid} variant="secondary" className="text-[9px] px-1.5 py-0">
                          {t?.displayName ?? tid.slice(0, 8)}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {isAi && (!member.toolIds || member.toolIds.length === 0) && (
                  <span className="text-muted-foreground/60">all tools</span>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={startEdit}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                {member.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => onRemove(member.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    className="h-8 text-sm"
                    value={editForm.displayName as string}
                    onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  />
                </div>
                {isAi && (
                  <div className="space-y-1">
                    <Label className="text-xs">Model</Label>
                    <Input
                      className="h-8 text-sm"
                      value={editForm.model as string}
                      onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                      placeholder="workspace default"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input
                  className="h-8 text-sm"
                  value={editForm.description as string}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              {isAi && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">System Prompt</Label>
                    <textarea
                      value={editForm.systemPrompt as string}
                      onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Trigger</Label>
                    <div className="flex gap-2">
                      {(["manual", "schedule", "event"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEditForm({ ...editForm, trigger: t })}
                          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            editForm.trigger === t ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent/50"
                          }`}
                        >
                          {triggerIcons[t]}
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" /> Tools
                      <span className="text-muted-foreground font-normal">(empty = all)</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {tools.filter((t) => t.isActive).map((tool) => (
                        <label
                          key={tool.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            (editForm.toolIds as string[]).includes(tool.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={(editForm.toolIds as string[]).includes(tool.id)}
                            onChange={() => toggleEditTool(tool.id)}
                            className="rounded"
                          />
                          {tool.displayName}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-xs">Active</Label>
                    <Switch
                      checked={editForm.isActive as boolean}
                      onCheckedChange={(v) => setEditForm({ ...editForm, isActive: v })}
                    />
                  </div>
                </>
              )}
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Permissions</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Page Access</Label>
                    <select
                      className="h-7 rounded-md border bg-background px-2 text-xs"
                      value={editForm.pageAccess as string}
                      onChange={(e) => setEditForm({ ...editForm, pageAccess: e.target.value })}
                    >
                      <option value="all">All pages</option>
                      <option value="selected">Selected pages</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Can Write</Label>
                    <Switch
                      checked={editForm.canWrite as boolean}
                      onCheckedChange={(v) => setEditForm({ ...editForm, canWrite: v })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
