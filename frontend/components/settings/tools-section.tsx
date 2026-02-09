"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbToolDefinitionSchema, type DbToolDefinition } from "@/lib/types/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Wrench,
  Plus,
  X,
  Globe,
  Cpu,
  Plug,
} from "lucide-react";
import { z } from "zod";

const toolsArraySchema = z.array(dbToolDefinitionSchema);

const TYPE_ICONS: Record<string, React.ReactNode> = {
  builtin: <Cpu className="h-4 w-4 text-blue-500" />,
  http: <Globe className="h-4 w-4 text-green-500" />,
  custom: <Plug className="h-4 w-4 text-purple-500" />,
};

export function ToolsSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    displayName: "",
    description: "",
    url: "",
    method: "GET",
  });

  const { data: tools = [], isLoading } = useQuery<DbToolDefinition[]>({
    queryKey: ["tool-definitions"],
    queryFn: async () => {
      const data = await api.toolDefinitions.list();
      return toolsArraySchema.parse(data);
    },
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.toolDefinitions.toggle(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-definitions"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return api.toolDefinitions.create({
        name: formData.name.toLowerCase().replace(/\s+/g, "_"),
        displayName: formData.displayName,
        description: formData.description,
        type: "http",
        config: {
          url: formData.url,
          method: formData.method,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-definitions"] });
      setShowForm(false);
      setFormData({ name: "", displayName: "", description: "", url: "", method: "GET" });
    },
  });

  const builtinTools = tools.filter((t) => t.type === "builtin");
  const customTools = tools.filter((t) => t.type !== "builtin");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wrench className="h-4 w-4" />
          Agent Tools
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "Add HTTP Tool"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Tools the agent can use. Toggle built-in tools on/off or add custom HTTP integrations.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* Built-in tools */}
          {builtinTools.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Built-in
              </p>
              {builtinTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    {TYPE_ICONS[tool.type]}
                    <div>
                      <p className="text-sm font-medium">{tool.displayName}</p>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={tool.isActive}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: tool.id, isActive: checked })
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {/* Custom tools */}
          {customTools.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Custom
              </p>
              {customTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    {TYPE_ICONS[tool.type]}
                    <div>
                      <p className="text-sm font-medium">{tool.displayName}</p>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {tool.type}
                    </Badge>
                    <Switch
                      checked={tool.isActive}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: tool.id, isActive: checked })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add HTTP tool form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tool-name">Tool Name</Label>
              <Input
                id="tool-name"
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    displayName: e.target.value,
                    name: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                  })
                }
                placeholder="LinkedIn Lookup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-method">Method</Label>
              <select
                id="tool-method"
                value={formData.method}
                onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool-url">URL</Label>
            <Input
              id="tool-url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool-desc">Description (shown to agent)</Label>
            <Input
              id="tool-desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What this tool does..."
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!formData.displayName.trim() || !formData.url.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Tool"}
          </Button>
        </div>
      )}
    </section>
  );
}
