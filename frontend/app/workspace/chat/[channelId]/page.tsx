"use client";

import { useParams, useSearchParams } from "next/navigation";
import { WorkspaceChatPanel } from "@/components/team-chat/workspace-chat-panel";

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get("nodeId") ?? undefined;

  return (
    <div className="h-screen max-h-screen overflow-hidden">
      <WorkspaceChatPanel channelId={channelId} nodeId={nodeId} />
    </div>
  );
}
