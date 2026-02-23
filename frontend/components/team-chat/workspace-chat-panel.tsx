"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, MessageCircle, Plus, Send, Loader2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useTeamMembers } from "@/lib/hooks/use-team";
import {
  useCreateWorkspaceChannel,
  useCreateWorkspaceDirect,
  useSendWorkspaceChatMessage,
  useWorkspaceChatChannels,
  useWorkspaceChatMessages,
} from "@/lib/hooks/use-workspace-chat";
import type { DbChatMessage } from "@/lib/types/team";

function ChatMessage({ msg, isOwn }: { msg: DbChatMessage; isOwn: boolean }) {
  const displayName = msg.userName || msg.userEmail.split("@")[0];
  const initial = (msg.userName?.[0] ?? msg.userEmail[0] ?? "?").toUpperCase();

  return (
    <div className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
          isOwn
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {initial}
      </div>
      <div className={`flex max-w-[75%] flex-col gap-0.5 ${isOwn ? "items-end" : ""}`}>
        {!isOwn && (
          <span className="px-1 text-[11px] font-medium text-muted-foreground">
            {displayName}
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isOwn
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

export function WorkspaceChatPanel() {
  const { userId } = useCurrentUser();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data, isLoading: channelsLoading } = useWorkspaceChatChannels();
  const channels = data?.channels ?? [];
  const directs = data?.directs ?? [];

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [directUserId, setDirectUserId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  // Auto-select first channel once loaded
  useEffect(() => {
    if (!activeChannelId && !channelsLoading) {
      const first = channels[0]?.id ?? directs[0]?.id ?? null;
      if (first) setActiveChannelId(first);
    }
  }, [activeChannelId, channelsLoading, channels, directs]);

  const { data: messages = [], isLoading: messagesLoading } =
    useWorkspaceChatMessages(activeChannelId);
  const createChannel = useCreateWorkspaceChannel();
  const createDirect = useCreateWorkspaceDirect();
  const sendMessage = useSendWorkspaceChatMessage(activeChannelId);

  // Scroll to bottom on channel switch or initial load
  useEffect(() => {
    if (activeChannelId !== prevChannelRef.current) {
      prevChannelRef.current = activeChannelId;
      requestAnimationFrame(() => {
        endRef.current?.scrollIntoView();
      });
    }
  }, [activeChannelId, messagesLoading]);

  // Auto-scroll on new messages if near bottom
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
    () => [...channels, ...directs].find((c) => c.id === activeChannelId) ?? null,
    [channels, directs, activeChannelId],
  );

  const dmOptions = teamMembers.filter((m) => m.userId !== userId);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || !activeChannelId) return;
    setMessage("");
    sendMessage.mutate(trimmed);
  }, [message, activeChannelId, sendMessage]);

  const handleCreateChannel = useCallback(() => {
    const value = newChannelName.trim();
    if (!value) return;
    createChannel.mutate(value, {
      onSuccess: (created) => {
        setNewChannelName("");
        if (created?.id) setActiveChannelId(created.id as string);
      },
    });
  }, [newChannelName, createChannel]);

  const handleCreateDirect = useCallback(() => {
    if (!directUserId) return;
    createDirect.mutate(directUserId, {
      onSuccess: (channel) => {
        if (channel?.id) setActiveChannelId(channel.id as string);
        setDirectUserId("");
      },
    });
  }, [directUserId, createDirect]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Chat</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {channelsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Channels */}
              <div className="mb-4">
                <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Channels
                </p>
                <div className="space-y-0.5">
                  {channels.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveChannelId(c.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        activeChannelId === c.id
                          ? "bg-accent font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                    >
                      <Hash className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateChannel();
                      }
                    }}
                    placeholder="new-channel"
                    className="h-7 text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    disabled={!newChannelName.trim() || createChannel.isPending}
                    onClick={handleCreateChannel}
                  >
                    {createChannel.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Direct messages */}
              <div>
                <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Direct messages
                </p>
                <div className="space-y-0.5">
                  {directs.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground/60">
                      No conversations yet
                    </p>
                  )}
                  {directs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setActiveChannelId(d.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        activeChannelId === d.id
                          ? "bg-accent font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                </div>
                {dmOptions.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    <select
                      className="h-7 flex-1 rounded-md border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      value={directUserId}
                      onChange={(e) => setDirectUserId(e.target.value)}
                    >
                      <option value="">Message...</option>
                      {dmOptions.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      disabled={!directUserId || createDirect.isPending}
                      onClick={handleCreateDirect}
                    >
                      {createDirect.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main area */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b px-6 py-3">
          {activeChannel ? (
            <>
              {activeChannel.kind === "channel" ? (
                <Hash className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Users className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <h1 className="text-sm font-semibold">
                  {activeChannel.kind === "channel"
                    ? activeChannel.name
                    : activeChannel.name}
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {activeChannel.kind === "direct"
                    ? "Direct conversation"
                    : "Channel"}
                </p>
              </div>
            </>
          ) : (
            <div>
              <h1 className="text-sm font-semibold text-muted-foreground">
                Select a conversation
              </h1>
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {!activeChannelId ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <MessageCircle className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                Pick a channel or direct message to start chatting.
              </p>
            </div>
          ) : messagesLoading ? (
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
              placeholder={
                activeChannelId
                  ? `Message ${activeChannel?.kind === "channel" ? `#${activeChannel.name}` : activeChannel?.name ?? ""}...`
                  : "Select a channel first"
              }
              className="flex-1"
              disabled={!activeChannelId}
            />
            <Button
              size="icon"
              className="shrink-0"
              disabled={
                !activeChannelId || !message.trim() || sendMessage.isPending
              }
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
      </section>
    </div>
  );
}
