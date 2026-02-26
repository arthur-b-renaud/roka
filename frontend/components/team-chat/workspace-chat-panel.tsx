"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  FileText,
  Hash,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useTeamMembers } from "@/lib/hooks/use-team";
import {
  useAddWorkspaceChatChannelAgent,
  useAddWorkspaceChatChannelMember,
  useRemoveWorkspaceChatChannelAgent,
  useRemoveWorkspaceChatChannelMember,
  useWorkspaceChatChannelMembers,
  useSendWorkspaceChatMessage,
  useWorkspaceChatChannels,
  useWorkspaceChatMessages,
} from "@/lib/hooks/use-workspace-chat";
import type { DbChatMessage, DbTeamMember } from "@/lib/types/team";

function ChatMessage({ msg, currentUserId }: { msg: DbChatMessage; currentUserId: string | null }) {
  const isBot = msg.authorKind === "ai";
  const displayName = msg.authorName ?? (isBot ? "Agent" : "User");
  const initial = isBot ? "A" : (displayName?.[0] ?? "?").toUpperCase();

  // For now, we can't perfectly detect "own" messages without member_id matching.
  // We rely on authorKind: human messages without a name might be "You".
  const isOwn = !isBot && msg.authorName === "You";

  return (
    <div className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
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
      <div className={`flex max-w-[75%] flex-col gap-0.5 ${isOwn ? "items-end" : ""}`}>
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
  nodeId?: string;
}

export function WorkspaceChatPanel({ channelId, nodeId: initialNodeId }: WorkspaceChatPanelProps) {
  const { userId } = useCurrentUser();
  const { toast } = useToast();
  const { data: allMembers = [] } = useTeamMembers();
  const { data } = useWorkspaceChatChannels();
  const channels = data?.channels ?? [];
  const directs = data?.directs ?? [];

  const [message, setMessage] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [pageContext, setPageContext] = useState<string | undefined>(initialNodeId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  const { data: messages = [], isLoading: messagesLoading } =
    useWorkspaceChatMessages(channelId);
  const { data: channelMembers = [], isLoading: membersLoading } =
    useWorkspaceChatChannelMembers(channelId);

  const sendMessage = useSendWorkspaceChatMessage(channelId, userId, pageContext);
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

  const humanChannelMembers = useMemo(
    () => channelMembers.filter((m) => m.kind === "human"),
    [channelMembers],
  );
  const aiChannelMembers = useMemo(
    () => channelMembers.filter((m) => m.kind === "ai"),
    [channelMembers],
  );

  const channelMemberIds = useMemo(
    () => new Set(channelMembers.map((m) => m.memberId)),
    [channelMembers],
  );

  const availableHumans = useMemo(
    () => allMembers.filter((m) => m.kind === "human" && !channelMemberIds.has(m.id)),
    [allMembers, channelMemberIds],
  );
  const availableAgents = useMemo(
    () => allMembers.filter((m) => m.kind === "ai" && m.isActive && !channelMemberIds.has(m.id)),
    [allMembers, channelMemberIds],
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
    (memberId: string) => {
      if (activeChannel?.kind !== "channel") return;
      removeMember.mutate(memberId, {
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
    (memberId: string) => {
      removeAgent.mutate(memberId, {
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
                  {aiChannelMembers.length > 0 && (
                    <span className="ml-1.5 text-violet-500">
                      · {aiChannelMembers.length} agent{aiChannelMembers.length > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  {channelMembers.length}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                {/* Human members */}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Members
                  </p>
                  {membersLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {humanChannelMembers.map((m) => (
                    <div
                      key={m.memberId}
                      className="flex items-center justify-between rounded px-2 py-1 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.displayName}</p>
                        {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                      </div>
                      {activeChannel.kind === "channel" && (
                        <button
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => handleRemoveMember(m.memberId)}
                          disabled={removeMember.isPending}
                          aria-label="Remove member"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {activeChannel.kind === "channel" && availableHumans.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={newMemberId}
                      onChange={(e) => setNewMemberId(e.target.value)}
                      className="h-7 flex-1 rounded-md border bg-background px-2 text-xs"
                      disabled={addMember.isPending}
                    >
                      <option value="">Add teammate...</option>
                      {availableHumans.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
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

                {/* AI agents */}
                <Separator className="my-3" />
                <div className="mb-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Agents
                  </p>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {aiChannelMembers.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      No agents — add one to get AI responses
                    </p>
                  )}
                  {aiChannelMembers.map((a) => (
                    <div
                      key={a.memberId}
                      className="flex items-center justify-between rounded px-2 py-1 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                        <p className="truncate font-medium">{a.displayName}</p>
                      </div>
                      <button
                        className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() => handleRemoveAgent(a.memberId)}
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
                          {a.displayName}
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
                {availableAgents.length === 0 && allMembers.filter((m) => m.kind === "ai").length === 0 && (
                  <p className="mt-1 px-2 text-[11px] text-muted-foreground">
                    Create AI agents in the Team page first
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
                currentUserId={userId}
              />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Page context banner */}
      {pageContext && (
        <div className="flex items-center gap-2 border-t bg-accent/30 px-4 py-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Page context attached</span>
          <button
            onClick={() => setPageContext(undefined)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-accent"
            aria-label="Remove page context"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className={`border-t px-4 py-3 ${pageContext ? "border-t-0" : ""}`}>
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
