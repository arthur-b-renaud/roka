"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { useWorkspaceChatChannels } from "@/lib/hooks/use-workspace-chat";

export default function ChatPage() {
  const router = useRouter();
  const { data, isLoading } = useWorkspaceChatChannels();

  const target =
    data?.channels.find((c) => c.name === "general")?.id ??
    data?.channels[0]?.id ??
    data?.directs[0]?.id ??
    null;

  useEffect(() => {
    if (isLoading || !data) return;
    if (target) {
      router.replace(`/workspace/chat/${target}`);
    }
  }, [data, isLoading, target, router]);

  if (isLoading || target) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
      <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">
        No channels yet. Create one from the sidebar.
      </p>
    </div>
  );
}
