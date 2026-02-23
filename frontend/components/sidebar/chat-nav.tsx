"use client";

import { useCallback, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Hash, Loader2, Plus, Users } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useTeamMembers } from "@/lib/hooks/use-team";
import {
  useCreateWorkspaceChannel,
  useCreateWorkspaceDirect,
  useWorkspaceChatChannels,
} from "@/lib/hooks/use-workspace-chat";

export function ChatNav() {
  const router = useRouter();
  const params = useParams();
  const activeChannelId = (params.channelId as string) ?? null;
  const { userId } = useCurrentUser();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data, isLoading } = useWorkspaceChatChannels();
  const channels = data?.channels ?? [];
  const directs = data?.directs ?? [];

  const [newChannelName, setNewChannelName] = useState("");
  const [directUserId, setDirectUserId] = useState("");
  const createChannel = useCreateWorkspaceChannel();
  const createDirect = useCreateWorkspaceDirect();

  const dmOptions = teamMembers.filter((m) => m.userId !== userId);

  const handleCreateChannel = useCallback(() => {
    const value = newChannelName.trim();
    if (!value) return;
    createChannel.mutate(value, {
      onSuccess: (created) => {
        setNewChannelName("");
        if (created?.id) router.push(`/workspace/chat/${created.id}`);
      },
    });
  }, [newChannelName, createChannel, router]);

  const handleCreateDirect = useCallback(
    (targetUserId: string) => {
      if (!targetUserId) return;
      createDirect.mutate(targetUserId, {
        onSuccess: (channel) => {
          if (channel?.id) router.push(`/workspace/chat/${channel.id}`);
          setDirectUserId("");
        },
      });
    },
    [createDirect, router],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--sidebar-muted))]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Channels */}
      <div>
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Channels
          </span>
        </div>
        <div className="space-y-0.5 px-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/workspace/chat/${c.id}`)}
              className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors duration-150 ${
                activeChannelId === c.id
                  ? "bg-accent/60 font-medium text-[hsl(var(--sidebar-foreground))]"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-accent/60"
              }`}
            >
              <Hash className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--sidebar-muted))]" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 px-2">
          <input
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateChannel();
              }
            }}
            placeholder="new-channel"
            className="h-6 flex-1 rounded border-0 bg-accent/40 px-1.5 text-[12px] text-[hsl(var(--sidebar-foreground))] placeholder:text-[hsl(var(--sidebar-muted))] focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            disabled={!newChannelName.trim() || createChannel.isPending}
            onClick={handleCreateChannel}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[hsl(var(--sidebar-muted))] transition-colors hover:text-[hsl(var(--sidebar-foreground))] disabled:opacity-40"
          >
            {createChannel.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Direct messages */}
      <div>
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Direct messages
          </span>
        </div>
        <div className="space-y-0.5 px-2">
          {directs.length === 0 && (
            <p className="px-1.5 py-1 text-[12px] text-[hsl(var(--sidebar-muted))]">
              No conversations yet
            </p>
          )}
          {directs.map((d) => (
            <button
              key={d.id}
              onClick={() => router.push(`/workspace/chat/${d.id}`)}
              className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors duration-150 ${
                activeChannelId === d.id
                  ? "bg-accent/60 font-medium text-[hsl(var(--sidebar-foreground))]"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-accent/60"
              }`}
            >
              <Users className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--sidebar-muted))]" />
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </div>
        {dmOptions.length > 0 && (
          <div className="mt-1.5 px-2">
            <select
              className="h-6 w-full rounded border-0 bg-accent/40 px-1.5 text-[12px] text-[hsl(var(--sidebar-foreground))] focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
              value={directUserId}
              disabled={createDirect.isPending}
              onChange={(e) => {
                const val = e.target.value;
                setDirectUserId(val);
                if (val) handleCreateDirect(val);
              }}
            >
              <option value="">
                {createDirect.isPending ? "Opening..." : "New message..."}
              </option>
              {dmOptions.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
