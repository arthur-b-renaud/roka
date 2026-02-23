"use client";

import { useParams } from "next/navigation";
import { WorkspaceChatPanel } from "@/components/team-chat/workspace-chat-panel";

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();

  return (
    <div className="h-screen max-h-screen overflow-hidden">
      <WorkspaceChatPanel channelId={channelId} />
    </div>
  );
}
