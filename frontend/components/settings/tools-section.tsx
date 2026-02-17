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
  X,
  Globe,
  Cpu,
  Plug,
  Blocks,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { z } from "zod";
import {
  COMMUNITY_TOOLS,
  CATEGORY_LABELS,
  type CommunityTool,
  type CatalogCategory,
} from "@/lib/constants/community-tools";

const toolsArraySchema = z.array(dbToolDefinitionSchema);

const TYPE_ICONS: Record<string, React.ReactNode> = {
  builtin: <Cpu className="h-4 w-4 text-blue-500" />,
  http: <Globe className="h-4 w-4 text-green-500" />,
  custom: <Plug className="h-4 w-4 text-purple-500" />,
  platform: <Blocks className="h-4 w-4 text-orange-500" />,
};

type ViewMode = "installed" | "catalog" | "http-form" | "custom-form";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors";

export function ToolsSection() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("installed");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<CatalogCategory | null>(null);
  const [selectedCatalogTool, setSelectedCatalogTool] = useState<CommunityTool | null>(null);

  // HTTP form state
  const [httpForm, setHttpForm] = useState({
    displayName: "",
    description: "",
    url: "",
    method: "GET",
  });

  // Custom platform form state
  const [customForm, setCustomForm] = useState({
    displayName: "",
    description: "",
    toolkit: "",
    toolName: "",
    credentialService: "",
    authType: "token",
    authKwarg: "",
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.toolDefinitions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-definitions"] });
    },
  });

  const createPlatformMutation = useMutation({
    mutationFn: async (tool: CommunityTool) => {
      const config: Record<string, unknown> = {
        toolkit: tool.toolkit,
      };
      if (tool.credentialService) {
        config.credential_service = tool.credentialService;
      }
      if (tool.auth.kwarg) {
        config.auth = { type: tool.auth.type, kwarg: tool.auth.kwarg };
      }
      return api.toolDefinitions.create({
        name: tool.id,
        displayName: tool.name,
        description: tool.description,
        type: "platform",
        config,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-definitions"] });
      setSelectedCatalogTool(null);
      setView("installed");
    },
  });

  const createHttpMutation = useMutation({
    mutationFn: async () => {
      return api.toolDefinitions.create({
        name: httpForm.displayName.toLowerCase().replace(/\s+/g, "_"),
        displayName: httpForm.displayName,
        description: httpForm.description,
        type: "http",
        config: { url: httpForm.url, method: httpForm.method },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-definitions"] });
      setView("installed");
      setHttpForm({ displayName: "", description: "", url: "", method: "GET" });
    },
  });

  const createCustomMutation = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = {
        toolkit: customForm.toolkit.trim(),
      };
      if (customForm.toolName.trim()) config.tool_name = customForm.toolName.trim();
      if (customForm.credentialService.trim()) config.credential_service = customForm.credentialService.trim();
      if (customForm.authType || customForm.authKwarg) {
        config.auth = { type: customForm.authType || "token", kwarg: customForm.authKwarg.trim() };
      }
      return api.toolDefinitions.create({
        name: customForm.displayName.toLowerCase().replace(/\s+/g, "_"),
        displayName: customForm.displayName,
        description: customForm.description,
        type: "platform",
        config,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-definitions"] });
      setView("installed");
      setCustomForm({ displayName: "", description: "", toolkit: "", toolName: "", credentialService: "", authType: "token", authKwarg: "" });
    },
  });

  const builtinTools = tools.filter((t) => t.type === "builtin");
  const userTools = tools.filter((t) => t.type !== "builtin");

  // Installed platform tool IDs (to dim catalog entries already installed)
  const installedNames = new Set(tools.map((t) => t.name));

  // Filter catalog
  const filteredCatalog = catalogSearch
    ? COMMUNITY_TOOLS.filter(
        (t) =>
          t.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
          t.description.toLowerCase().includes(catalogSearch.toLowerCase()) ||
          t.category.includes(catalogSearch.toLowerCase()),
      )
    : COMMUNITY_TOOLS;

  // Group by category
  const groupedCatalog = filteredCatalog.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    },
    {} as Record<CatalogCategory, CommunityTool[]>,
  );

  const categoryOrder: CatalogCategory[] = [
    "search", "productivity", "communication", "web", "database", "finance", "code", "knowledge", "other",
  ];

  return (
    <section className="space-y-5">
      {/* Header + nav tabs */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wrench className="h-4 w-4" />
          Agent Tools
        </h2>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
        <TabButton active={view === "installed"} onClick={() => setView("installed")}>
          Installed
          {tools.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
              {tools.length}
            </Badge>
          )}
        </TabButton>
        <TabButton active={view === "catalog"} onClick={() => setView("catalog")}>
          Community Catalog
        </TabButton>
        <TabButton active={view === "http-form"} onClick={() => setView("http-form")}>
          + HTTP Tool
        </TabButton>
        <TabButton active={view === "custom-form"} onClick={() => setView("custom-form")}>
          + Custom
        </TabButton>
      </div>

      {/* ─── Installed View ─────────────────────── */}
      {view === "installed" && (
        <>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tools.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Wrench className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No tools installed</p>
              <p className="mt-1">Browse the Community Catalog to add tools, or create a custom one.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setView("catalog")}>
                Browse Catalog
              </Button>
            </div>
          ) : (
            <>
              {builtinTools.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Built-in
                  </p>
                  {builtinTools.map((tool) => (
                    <ToolRow
                      key={tool.id}
                      tool={tool}
                      showBadge
                      disableToggle
                    />
                  ))}
                </div>
              )}
              {userTools.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Custom / Platform
                  </p>
                  {userTools.map((tool) => (
                    <ToolRow
                      key={tool.id}
                      tool={tool}
                      showBadge
                      showDelete
                      onToggle={(checked) => toggleMutation.mutate({ id: tool.id, isActive: checked })}
                      onDelete={() => deleteMutation.mutate(tool.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Catalog View ───────────────────────── */}
      {view === "catalog" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search community tools..."
              className="pl-9"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {COMMUNITY_TOOLS.length} tools from{" "}
            <a
              href="https://docs.langchain.com/oss/python/integrations/tools"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              LangChain Python Community
            </a>
            . Click to install.
          </p>

          {/* Confirm dialog for selected tool */}
          {selectedCatalogTool && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold">{selectedCatalogTool.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedCatalogTool.description}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedCatalogTool(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Toolkit:</span>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{selectedCatalogTool.toolkit}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Package:</span>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{selectedCatalogTool.pip}</code>
                </div>
                {selectedCatalogTool.credentialService && (
                  <div>
                    <span className="text-muted-foreground">Credential:</span>{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{selectedCatalogTool.credentialService}</code>
                  </div>
                )}
                {selectedCatalogTool.auth.kwarg && (
                  <div>
                    <span className="text-muted-foreground">Auth:</span>{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{selectedCatalogTool.auth.type} / {selectedCatalogTool.auth.kwarg}</code>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => createPlatformMutation.mutate(selectedCatalogTool)}
                  disabled={createPlatformMutation.isPending}
                >
                  {createPlatformMutation.isPending ? "Installing..." : "Install Tool"}
                </Button>
                <a href={selectedCatalogTool.docsUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1">
                    <ExternalLink className="h-3 w-3" /> Docs
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* Category groups */}
          <div className="space-y-1">
            {categoryOrder.map((cat) => {
              const catTools = groupedCatalog[cat];
              if (!catTools || catTools.length === 0) return null;
              const isExpanded = expandedCategory === cat || !!catalogSearch;

              return (
                <div key={cat}>
                  <button
                    onClick={() => setExpandedCategory(isExpanded && !catalogSearch ? null : cat)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent/50"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {CATEGORY_LABELS[cat]}
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                      {catTools.length}
                    </Badge>
                  </button>

                  {isExpanded && (
                    <div className="ml-4 space-y-0.5 pb-2">
                      {catTools.map((ct) => {
                        const isInstalled = installedNames.has(ct.id);
                        return (
                          <button
                            key={ct.id}
                            onClick={() => !isInstalled && setSelectedCatalogTool(ct)}
                            disabled={isInstalled}
                            className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                              isInstalled
                                ? "opacity-50 cursor-default border-transparent"
                                : "hover:bg-accent/50 hover:border-accent cursor-pointer"
                            }`}
                          >
                            <Blocks className="h-4 w-4 shrink-0 text-orange-500" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{ct.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{ct.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground">{ct.pricing}</span>
                              {isInstalled && (
                                <Badge variant="secondary" className="text-[10px]">Installed</Badge>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── HTTP Tool Form ─────────────────────── */}
      {view === "http-form" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            New HTTP Tool
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="http-name">Display Name</Label>
              <Input
                id="http-name"
                value={httpForm.displayName}
                onChange={(e) => setHttpForm({ ...httpForm, displayName: e.target.value })}
                placeholder="LinkedIn Lookup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="http-method">Method</Label>
              <select
                id="http-method"
                value={httpForm.method}
                onChange={(e) => setHttpForm({ ...httpForm, method: e.target.value })}
                className={SELECT_CLASS}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="http-url">URL</Label>
            <Input
              id="http-url"
              value={httpForm.url}
              onChange={(e) => setHttpForm({ ...httpForm, url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="http-desc">Description (shown to agent)</Label>
            <Input
              id="http-desc"
              value={httpForm.description}
              onChange={(e) => setHttpForm({ ...httpForm, description: e.target.value })}
              placeholder="What this tool does..."
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => createHttpMutation.mutate()}
              disabled={!httpForm.displayName.trim() || !httpForm.url.trim() || createHttpMutation.isPending}
            >
              {createHttpMutation.isPending ? "Creating..." : "Create HTTP Tool"}
            </Button>
            <Button variant="ghost" onClick={() => setView("installed")}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ─── Custom Platform Form ───────────────── */}
      {view === "custom-form" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Custom Platform Tool (any LangChain toolkit)
          </p>
          <p className="text-xs text-muted-foreground">
            Manually specify a Python toolkit class. Use this for tools not in the catalog.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="custom-name">Display Name</Label>
              <Input
                id="custom-name"
                value={customForm.displayName}
                onChange={(e) => setCustomForm({ ...customForm, displayName: e.target.value })}
                placeholder="My Custom Tool"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-toolkit">Toolkit Class (Python path)</Label>
              <Input
                id="custom-toolkit"
                value={customForm.toolkit}
                onChange={(e) => setCustomForm({ ...customForm, toolkit: e.target.value })}
                placeholder="langchain_community.tools.my_tool.MyTool"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="custom-tool-name">
                Tool Name <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="custom-tool-name"
                value={customForm.toolName}
                onChange={(e) => setCustomForm({ ...customForm, toolName: e.target.value })}
                placeholder="specific_tool_name"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-cred">Credential Service</Label>
              <Input
                id="custom-cred"
                value={customForm.credentialService}
                onChange={(e) => setCustomForm({ ...customForm, credentialService: e.target.value })}
                placeholder="e.g. google, slack, stripe"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="custom-auth-type">Auth Type</Label>
              <select
                id="custom-auth-type"
                value={customForm.authType}
                onChange={(e) => setCustomForm({ ...customForm, authType: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="token">token</option>
                <option value="api_key">api_key</option>
                <option value="google_resource">google_resource</option>
                <option value="env">env (environment variable)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-auth-kwarg">Auth Kwarg / Env Var</Label>
              <Input
                id="custom-auth-kwarg"
                value={customForm.authKwarg}
                onChange={(e) => setCustomForm({ ...customForm, authKwarg: e.target.value })}
                placeholder="API_KEY or api_resource"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-desc">Description (shown to agent)</Label>
            <Input
              id="custom-desc"
              value={customForm.description}
              onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
              placeholder="What this tool does..."
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => createCustomMutation.mutate()}
              disabled={!customForm.displayName.trim() || !customForm.toolkit.trim() || createCustomMutation.isPending}
            >
              {createCustomMutation.isPending ? "Creating..." : "Create Custom Tool"}
            </Button>
            <Button variant="ghost" onClick={() => setView("installed")}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Sub-components ────────────────────────── */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-background font-medium shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ToolRow({
  tool,
  showBadge,
  showDelete,
  disableToggle,
  onToggle,
  onDelete,
}: {
  tool: DbToolDefinition;
  showBadge?: boolean;
  showDelete?: boolean;
  disableToggle?: boolean;
  onToggle?: (checked: boolean) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
      <div className="flex items-center gap-3">
        {TYPE_ICONS[tool.type] ?? TYPE_ICONS.custom}
        <div>
          <p className="text-sm font-medium">{tool.displayName}</p>
          <p className="text-xs text-muted-foreground">{tool.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {showBadge && (
          <Badge variant="outline" className="text-xs">
            {tool.type}
          </Badge>
        )}
        <Switch
          checked={tool.isActive}
          onCheckedChange={onToggle}
          disabled={disableToggle}
        />
        {showDelete && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
