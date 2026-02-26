"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useRecentPages, usePinnedPages } from "@/lib/queries/nodes";
import { useSetupComplete } from "@/lib/hooks/use-app-settings";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Database,
  Clock,
  Pin,
  Bot,
  MessageCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nodeUrl } from "@/lib/slug";
import type { DbNode } from "@/lib/types/database";

export default function WorkspacePage() {
  const router = useRouter();
  const { userId } = useCurrentUser();

  const { data: recentPages = [], isLoading: loadingRecent } = useRecentPages(userId);
  const { data: pinnedPages = [] } = usePinnedPages(userId);
  const { llmConfigured } = useSetupComplete();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-24 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      </div>

      {llmConfigured && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => router.push("/workspace/chat")}
        >
          <MessageCircle className="h-4 w-4" />
          Open Chat
        </Button>
      )}

      {/* Pinned pages */}
      {pinnedPages.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Pin className="h-3.5 w-3.5" />
            Pinned
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pinnedPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(nodeUrl(page.title, page.id))} />
            ))}
          </div>
        </section>
      )}

      {/* Recent pages */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Recent
        </h2>
        {loadingRecent ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : recentPages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pages yet. Create one from the sidebar.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recentPages.map((page) => (
              <PageCard key={page.id} node={page} onClick={() => router.push(nodeUrl(page.title, page.id))} />
            ))}
          </div>
        )}
      </section>

      {/* Activity feed */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          Activity
        </h2>
        <ActivityFeed userId={userId} />
      </section>
    </div>
  );
}

const PageCard = memo(function PageCard({ node, onClick }: { node: DbNode; onClick: () => void }) {
  const Icon = node.type === "database" ? Database : FileText;

  return (
    <button
      onClick={onClick}
      aria-label={`Open ${node.title || "Untitled"}`}
      className="flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors duration-150 hover:bg-accent/50"
    >
      <div className="flex items-center gap-2">
        {node.icon ? (
          <span className="text-lg">{node.icon}</span>
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium truncate">
          {node.title || "Untitled"}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(node.updatedAt), { addSuffix: true })}
      </span>
    </button>
  );
});
