"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, MessageCircle, Send, Loader2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import {
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

interface WorkspaceChatPanelProps {
  channelId: string;
}

export function WorkspaceChatPanel({ channelId }: WorkspaceChatPanelProps) {
  const { userId } = useCurrentUser();
  const { data } = useWorkspaceChatChannels();
  const channels = data?.channels ?? [];
  const directs = data?.directs ?? [];

  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef<string | null>(null);

  const { data: messages = [], isLoading: messagesLoading } =
    useWorkspaceChatMessages(channelId);
  const sendMessage = useSendWorkspaceChatMessage(channelId, userId);

  useEffect(() => {
    if (channelId !== prevChannelRef.current) {
      prevChannelRef.current = channelId;
      setMessage("");
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

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || !channelId) return;
    setMessage("");
    sendMessage.mutate(trimmed);
  }, [message, channelId, sendMessage]);

  return (
    <div className="flex h-full flex-col">
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
                {activeChannel.name}
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
              Loading...
            </h1>
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
