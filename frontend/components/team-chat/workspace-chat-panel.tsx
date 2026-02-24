"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Bot,
  Hash,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useTeamMembers } from "@/lib/hooks/use-team";
import { api } from "@/lib/api";
import { dbAgentDefinitionSchema, type DbAgentDefinition } from "@/lib/types/agent";
import {
  useAddWorkspaceChatChannelAgent,
  useAddWorkspaceChatChannelMember,
  useRemoveWorkspaceChatChannelAgent,
  useRemoveWorkspaceChatChannelMember,
  useWorkspaceChatChannelAgents,
  useWorkspaceChatChannelMembers,
  useSendWorkspaceChatMessage,
  useWorkspaceChatChannels,
  useWorkspaceChatMessages,
} from "@/lib/hooks/use-workspace-chat";
import type { DbChatMessage } from "@/lib/types/team";

const agentsArraySchema = z.array(dbAgentDefinitionSchema);

function ChatMessage({ msg, isOwn }: { msg: DbChatMessage; isOwn: boolean }) {
  const isBot = !!msg.agentDefinitionId;
  const displayName = isBot
    ? (msg.agentName ?? "Agent")
    : (msg.userName || msg.userEmail.split("@")[0]);
  const initial = isBot ? "A" : (msg.userName?.[0] ?? msg.userEmail[0] ?? "?").toUpperCase();

  return (
    <div className={`flex gap-2.5 ${isOwn && !isBot ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
          isBot
            ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300"
            : isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {isBot ? <Bot className="h-3.5 w-3.5" /> : initial}
      </div>
      <div className={`flex max-w-[75%] flex-col gap-0.5 ${isOwn && !isBot ? "items-end" : ""}`}>
        <span className="px-1 text-[11px] font-medium text-muted-foreground">
          {displayName}{isBot && <span className="ml-1 text-violet-500">bot</span>}
        </span>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isBot
              ? "border border-violet-200 bg-violet-50 text-foreground dark:border-violet-800 dark:bg-violet-950"
              : isOwn
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
        <span className="px-1 text-[10px] text-muted-foreground/60">
          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

interface WorkspaceChatPanelProps {
  channelId: string;
}

export function WorkspaceChatPanel({ channelId }: WorkspaceChatPanelProps) {
  const { userId } = useCurrentUser();
  const { toast } = useToast();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data } = useWorkspaceChatChannels();
  const channels = data?.channels ?? [];
  const directs = data?.directs ?? [];

  const [message, setMessage] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  const { data: messages = [], isLoading: messagesLoading } =
    useWorkspaceChatMessages(channelId);
  const { data: channelMembers = [], isLoading: membersLoading } =
    useWorkspaceChatChannelMembers(channelId);
  const { data: channelAgents = [] } =
    useWorkspaceChatChannelAgents(channelId);
  const { data: allAgents = [] } = useQuery<DbAgentDefinition[]>({
    queryKey: ["agent-definitions"],
    queryFn: async () => {
      const d = await api.agentDefinitions.list();
      return agentsArraySchema.parse(d);
    },
    staleTime: 30_000,
  });

  const sendMessage = useSendWorkspaceChatMessage(channelId, userId);
  const addMember = useAddWorkspaceChatChannelMember(channelId);
  const removeMember = useRemoveWorkspaceChatChannelMember(channelId);
  const addAgent = useAddWorkspaceChatChannelAgent(channelId);
  const removeAgent = useRemoveWorkspaceChatChannelAgent(channelId);

  useEffect(() => {
    if (channelId !== prevChannelRef.current) {
      prevChannelRef.current = channelId;
      setMessage("");
      setNewMemberId("");
      setNewAgentId("");
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView();
      });
    }
  }, [channelId, messagesLoading]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  const activeChannel = useMemo(
    () => [...channels, ...directs].find((c) => c.id === channelId) ?? null,
    [channels, directs, channelId],
  );
  const memberIds = useMemo(
    () => new Set(channelMembers.map((m) => m.userId)),
    [channelMembers],
  );
  const availableMembers = useMemo(
    () => teamMembers.filter((m) => !memberIds.has(m.userId)),
    [teamMembers, memberIds],
  );
  const channelAgentIds = useMemo(
    () => new Set(channelAgents.map((a) => a.agentDefinitionId)),
    [channelAgents],
  );
  const availableAgents = useMemo(
    () => allAgents.filter((a) => a.isActive && !channelAgentIds.has(a.id)),
    [allAgents, channelAgentIds],
  );

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || !channelId) return;
    setMessage("");
    sendMessage.mutate(trimmed);
  }, [message, channelId, sendMessage]);

  const handleAddMember = useCallback(() => {
    if (!newMemberId || activeChannel?.kind !== "channel") return;
    addMember.mutate(newMemberId, {
      onSuccess: () => setNewMemberId(""),
      onError: (err) =>
        toast(err instanceof Error ? err.message : "Failed to add member", "error"),
    });
  }, [newMemberId, activeChannel?.kind, addMember, toast]);

  const handleRemoveMember = useCallback(
    (memberUserId: string) => {
      if (activeChannel?.kind !== "channel") return;
      removeMember.mutate(memberUserId, {
        onError: (err) =>
          toast(err instanceof Error ? err.message : "Failed to remove member", "error"),
      });
    },
    [activeChannel?.kind, removeMember, toast],
  );

  const handleAddAgent = useCallback(() => {
    if (!newAgentId) return;
    addAgent.mutate(newAgentId, {
      onSuccess: () => setNewAgentId(""),
      onError: (err) =>
        toast(err instanceof Error ? err.message : "Failed to add agent", "error"),
    });
  }, [newAgentId, addAgent, toast]);

  const handleRemoveAgent = useCallback(
    (agentDefId: string) => {
      removeAgent.mutate(agentDefId, {
        onError: (err) =>
          toast(err instanceof Error ? err.message : "Failed to remove agent", "error"),
      });
    },
    [removeAgent, toast],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2.5 border-b px-6 py-3">
        {activeChannel ? (
          <>
            <div className="flex items-center gap-2.5">
              {activeChannel.kind === "channel" ? (
                <Hash className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Users className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <h1 className="text-sm font-semibold">{activeChannel.name}</h1>
                <p className="text-[11px] text-muted-foreground">
                  {activeChannel.kind === "direct"
                    ? "Direct conversation"
                    : "Channel"}
                  {channelAgents.length > 0 && (
                    <span className="ml-1.5 text-violet-500">
                      · {channelAgents.length} agent{channelAgents.length > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  {channelMembers.length + channelAgents.length}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                {/* Members section */}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Members
                  </p>
                  {membersLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {channelMembers.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between rounded px-2 py-1 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.name || m.email.split("@")[0]}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      </div>
                      {activeChannel.kind === "channel" && m.userId !== userId && (
                        <button
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => handleRemoveMember(m.userId)}
                          disabled={removeMember.isPending}
                          aria-label="Remove member"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {activeChannel.kind === "channel" && availableMembers.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={newMemberId}
                      onChange={(e) => setNewMemberId(e.target.value)}
                      className="h-7 flex-1 rounded-md border bg-background px-2 text-xs"
                      disabled={addMember.isPending}
                    >
                      <option value="">Add teammate...</option>
                      {availableMembers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      disabled={!newMemberId || addMember.isPending}
                      onClick={handleAddMember}
                    >
                      {addMember.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}

                {/* Agents section */}
                <Separator className="my-3" />
                <div className="mb-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Agents
                  </p>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {channelAgents.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      No agents — add one to get AI responses
                    </p>
                  )}
                  {channelAgents.map((a) => (
                    <div
                      key={a.agentDefinitionId}
                      className="flex items-center justify-between rounded px-2 py-1 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{a.name}</p>
                          {a.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {a.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() => handleRemoveAgent(a.agentDefinitionId)}
                        disabled={removeAgent.isPending}
                        aria-label="Remove agent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {availableAgents.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={newAgentId}
                      onChange={(e) => setNewAgentId(e.target.value)}
                      className="h-7 flex-1 rounded-md border bg-background px-2 text-xs"
                      disabled={addAgent.isPending}
                    >
                      <option value="">Add agent...</option>
                      {availableAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      disabled={!newAgentId || addAgent.isPending}
                      onClick={handleAddAgent}
                    >
                      {addAgent.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
                {allAgents.length === 0 && (
                  <p className="mt-1 px-2 text-[11px] text-muted-foreground">
                    Create agents in the Agents page first
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </>
        ) : (
          <div>
            <h1 className="text-sm font-semibold text-muted-foreground">Loading...</h1>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messagesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                isOwn={msg.userId === userId}
              />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${activeChannel?.kind === "channel" ? `#${activeChannel.name}` : activeChannel?.name ?? ""}...`}
            className="flex-1"
          />
          <Button
            size="icon"
            className="shrink-0"
            disabled={!message.trim() || sendMessage.isPending}
            onClick={handleSend}
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
