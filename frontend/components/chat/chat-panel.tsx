"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useSendMessage,
} from "@/lib/hooks/use-conversations";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot,
  MessageSquarePlus,
  Send,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { DbConversation } from "@/lib/types/agent";

interface ChatPanelProps {
  nodeId?: string;
  minimalMode?: boolean;
}

export function ChatPanel({ nodeId, minimalMode = false }: ChatPanelProps) {
  const { userId } = useCurrentUser();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useConversations(userId);
  const { data: messages = [], isLoading: loadingMessages } = useMessages(activeConversationId);
  const createConversation = useCreateConversation();

  // Dynamic send hook -- only create when we have an active conversation
  const sendMessageMutation = useSendMessage(activeConversationId ?? "");

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleNewConversation = useCallback(async () => {
    const conv = await createConversation.mutateAsync({
      title: "New conversation",
    });
    setActiveConversationId(conv.id);
    setShowList(false);
  }, [createConversation]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeConversationId) return;

    setInput("");
    await sendMessageMutation.mutateAsync({
      content: trimmed,
      nodeId: nodeId ?? null,
      minimalMode,
    });
  }, [input, activeConversationId, sendMessageMutation, nodeId, minimalMode]);

  const handleSelectConversation = (conv: DbConversation) => {
    setActiveConversationId(conv.id);
    setShowList(false);
  };

  // Conversation list view
  if (showList) {
    return (
      <div className="flex flex-col rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4" />
            Agent Chat
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={handleNewConversation}
            disabled={createConversation.isPending}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <Bot className="h-8 w-8 opacity-40" />
              <p>No conversations yet.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewConversation}
                disabled={createConversation.isPending}
              >
                Start a conversation
              </Button>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50 last:border-0"
              >
                <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 truncate">
                  <p className="truncate text-sm font-medium">{conv.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Active conversation view
  return (
    <div className="flex flex-col rounded-lg border">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowList(true)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">
          {conversations.find((c) => c.id === activeConversationId)?.title || "Chat"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex max-h-[400px] min-h-[200px] flex-col gap-3 overflow-y-auto p-4">
        {loadingMessages ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Bot className="h-8 w-8 opacity-40" />
            <p className="text-sm">Send a message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t px-3 py-2.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask the agent..."
          className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 text-sm"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sendMessageMutation.isPending}
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {sendMessageMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
