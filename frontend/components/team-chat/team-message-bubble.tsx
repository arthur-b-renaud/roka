"use client";

import { formatDistanceToNow } from "date-fns";
import type { DbTeamMessage } from "@/lib/types/team";

interface TeamMessageBubbleProps {
  message: DbTeamMessage;
  isOwn: boolean;
}

export function TeamMessageBubble({ message, isOwn }: TeamMessageBubbleProps) {
  const displayName = message.userName || message.userEmail.split("@")[0];
  const initial = (message.userName?.[0] ?? message.userEmail[0]).toUpperCase();

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
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="px-1 text-[10px] text-muted-foreground/60">
          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
