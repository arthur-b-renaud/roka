"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  Brain,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type TraceStep = {
  step: number;
  type: "thinking" | "tool_call" | "tool_result" | "response";
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
  duration_ms?: number;
  ts: string;
};

type Execution = {
  id: string;
  workflow: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  traceLog: TraceStep[];
  s3TraceKey: string | null;
  agentDefinitionId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
  running: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, color: "text-blue-500" },
  completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-green-600" },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, color: "text-red-500" },
  cancelled: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "text-amber-500" },
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  thinking: <Brain className="h-3.5 w-3.5 text-purple-500" />,
  tool_call: <Wrench className="h-3.5 w-3.5 text-blue-500" />,
  tool_result: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  response: <MessageSquare className="h-3.5 w-3.5 text-primary" />,
};

export default function ExecutionsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const { data: executions = [], isLoading } = useQuery<Execution[]>({
    queryKey: ["executions", limit],
    queryFn: () => api.executions.list(limit),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity className="h-6 w-6" />
            Executions
          </h1>
          <p className="mt-1 text-muted-foreground">
            Audit agent task executions, tool calls, and reasoning traces
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Auto-refresh 15s</span>
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading executions...
        </div>
      ) : executions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No executions yet</p>
          <p className="mt-1">Agent tasks will appear here as they run.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {executions.map((exec) => {
            const isExpanded = expandedId === exec.id;
            const statusCfg = STATUS_CONFIG[exec.status] ?? STATUS_CONFIG.pending;
            const prompt = (exec.input as Record<string, string>)?.prompt || "";
            const response = (exec.output as Record<string, string>)?.response || exec.error || "";
            const traceSteps = Array.isArray(exec.traceLog) ? exec.traceLog : [];
            const toolCallCount = traceSteps.filter((s) => s.type === "tool_call").length;
            const duration =
              exec.startedAt && exec.completedAt
                ? Math.round(
                    (new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000,
                  )
                : null;

            return (
              <div key={exec.id} className="rounded-lg border">
                {/* Header row */}
                <button
                  onClick={() => toggleExpand(exec.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}

                  <div className={`shrink-0 ${statusCfg.color}`}>{statusCfg.icon}</div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {prompt ? prompt.slice(0, 80) + (prompt.length > 80 ? "..." : "") : `[${exec.workflow}]`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {response.slice(0, 100)}
                      {response.length > 100 ? "..." : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {toolCallCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Wrench className="h-2.5 w-2.5" />
                        {toolCallCount}
                      </Badge>
                    )}
                    <Badge
                      variant={exec.status === "completed" ? "default" : exec.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {exec.status}
                    </Badge>
                    {duration !== null && (
                      <span className="text-[10px] text-muted-foreground">{duration}s</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(exec.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </button>

                {/* Expanded trace */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                    {/* Metadata */}
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Task ID:</span>{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{exec.id.slice(0, 8)}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Workflow:</span> {exec.workflow}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>{" "}
                        {format(new Date(exec.createdAt), "MMM d, HH:mm:ss")}
                      </div>
                    </div>

                    {/* Error */}
                    {exec.error && (
                      <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                        {exec.error}
                      </div>
                    )}

                    {/* Trace steps */}
                    {traceSteps.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Execution Trace ({traceSteps.length} steps)
                        </p>
                        <div className="relative ml-4 border-l border-muted-foreground/20 pl-4 space-y-2">
                          {traceSteps.map((step, i) => (
                            <TraceStepRow key={i} step={step} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No trace data available for this execution.</p>
                    )}

                    {/* Full prompt */}
                    {prompt && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Full prompt
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px]">
                          {prompt}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {executions.length >= limit && (
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 50)}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TraceStepRow({ step }: { step: TraceStep }) {
  const [expanded, setExpanded] = useState(false);
  const icon = STEP_ICONS[step.type] ?? STEP_ICONS.thinking;

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/30" />

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 text-left text-xs hover:bg-accent/30 rounded px-1 py-0.5 -mx-1"
      >
        <span className="shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1">
          {step.type === "tool_call" && (
            <span>
              <span className="font-medium">{step.tool}</span>
              <span className="text-muted-foreground ml-1">called</span>
            </span>
          )}
          {step.type === "tool_result" && (
            <span>
              <span className="font-medium">{step.tool}</span>
              <span className="text-muted-foreground ml-1">returned</span>
              {step.duration_ms !== undefined && (
                <span className="text-muted-foreground ml-1">({step.duration_ms}ms)</span>
              )}
            </span>
          )}
          {step.type === "thinking" && (
            <span className="text-muted-foreground">
              {(step.content || "").slice(0, 120)}
              {(step.content || "").length > 120 ? "..." : ""}
            </span>
          )}
          {step.type === "response" && (
            <span>
              <span className="font-medium">Response:</span>{" "}
              <span className="text-muted-foreground">
                {(step.content || "").slice(0, 120)}
                {(step.content || "").length > 120 ? "..." : ""}
              </span>
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="ml-6 mt-1 space-y-1">
          {step.input && (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[10px] max-h-40 overflow-auto">
              {JSON.stringify(step.input, null, 2)}
            </pre>
          )}
          {step.output && (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[10px] max-h-40 overflow-auto">
              {step.output}
            </pre>
          )}
          {step.content && step.type !== "response" && step.type !== "thinking" && (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[10px] max-h-40 overflow-auto">
              {step.content}
            </pre>
          )}
          {step.type === "thinking" && step.content && (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[10px] max-h-40 overflow-auto">
              {step.content}
            </pre>
          )}
          {step.type === "response" && step.content && (
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-[10px] max-h-60 overflow-auto">
              {step.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
