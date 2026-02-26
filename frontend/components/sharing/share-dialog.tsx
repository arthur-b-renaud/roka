"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Copy, Globe, Link2, Users, Check } from "lucide-react";
import { copyToClipboard, slugify } from "@/lib/utils";

type Visibility = "private" | "team" | "shared" | "published";

interface SharingData {
  id: string;
  visibility: Visibility;
  shareToken: string | null;
  publishedSlug: string | null;
  publishedAt: string | null;
}

interface ShareDialogProps {
  nodeId: string;
  nodeTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ nodeId, nodeTitle, open, onOpenChange }: ShareDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [publishedSlug, setPublishedSlug] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: sharing, isLoading } = useQuery<SharingData>({
    queryKey: ["node-sharing", nodeId],
    queryFn: () => api.nodes.sharing.get(nodeId),
    enabled: open,
  });

  useEffect(() => {
    if (sharing?.publishedSlug) {
      setPublishedSlug(sharing.publishedSlug);
    } else if (nodeTitle) {
      setPublishedSlug(slugify(nodeTitle));
    }
  }, [sharing, nodeTitle]);

  const updateVisibility = useMutation({
    mutationFn: async (data: { visibility: Visibility; publishedSlug?: string }) =>
      api.nodes.sharing.update(nodeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["node-sharing", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["node", nodeId] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Failed to update sharing", "error");
    },
  });

  const isTeam = sharing?.visibility === "team";
  const isShared = sharing?.visibility === "shared" || sharing?.visibility === "published";
  const isPublished = sharing?.visibility === "published";

  const handleTeamToggle = useCallback(
    (checked: boolean) => {
      updateVisibility.mutate({
        visibility: checked ? "team" : "private",
      });
    },
    [updateVisibility],
  );

  const handleShareLinkToggle = useCallback(
    (checked: boolean) => {
      updateVisibility.mutate({
        visibility: checked ? "shared" : (isTeam ? "team" : "private"),
      });
    },
    [updateVisibility, isTeam],
  );

  const handlePublishToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        const slug = publishedSlug || slugify(nodeTitle);
        if (!slug) {
          toast("Enter a slug before publishing", "error");
          return;
        }
        updateVisibility.mutate({ visibility: "published", publishedSlug: slug });
      } else {
        updateVisibility.mutate({
          visibility: isTeam ? "team" : "private",
        });
      }
    },
    [updateVisibility, publishedSlug, nodeTitle, isTeam, toast],
  );

  const handleCopy = useCallback(
    async (text: string, label: string) => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(label);
        toast("Link copied to clipboard");
        setTimeout(() => setCopied(null), 2000);
      } else {
        toast("Failed to copy to clipboard", "error");
      }
    },
    [toast],
  );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = sharing?.shareToken ? `${origin}/share/${sharing.shareToken}` : "";
  const publishedUrl = sharing?.publishedSlug ? `${origin}/p/${sharing.publishedSlug}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Share page
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Team access */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Workspace access</Label>
                  <p className="text-xs text-muted-foreground">
                    All workspace members can view this page
                  </p>
                </div>
              </div>
              <Switch
                checked={isTeam || isShared}
                onCheckedChange={handleTeamToggle}
                disabled={isShared || updateVisibility.isPending}
              />
            </div>

            <Separator />

            {/* Share link */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <Label className="text-sm font-medium">Share link</Label>
                    <p className="text-xs text-muted-foreground">
                      Anyone with the link can view this page
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isShared}
                  onCheckedChange={handleShareLinkToggle}
                  disabled={updateVisibility.isPending}
                />
              </div>

              {isShared && shareUrl && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {shareUrl}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => handleCopy(shareUrl, "share")}
                  >
                    {copied === "share" ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Publish */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <Label className="text-sm font-medium">Publish to web</Label>
                    <p className="text-xs text-muted-foreground">
                      Public page discoverable by anyone
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isPublished}
                  onCheckedChange={handlePublishToggle}
                  disabled={updateVisibility.isPending}
                />
              </div>

              {(isPublished || isShared) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">{origin}/p/</span>
                    <Input
                      value={publishedSlug}
                      onChange={(e) => setPublishedSlug(slugify(e.target.value))}
                      placeholder="my-page-slug"
                      className="h-8 text-xs"
                      disabled={!isPublished && !isShared}
                    />
                  </div>
                  {isPublished && publishedUrl && (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {publishedUrl}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0"
                        onClick={() => handleCopy(publishedUrl, "published")}
                      >
                        {copied === "published" ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
