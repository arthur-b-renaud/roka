"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const PublicPageShell = dynamic(
  () => import("@/components/editor/public-page-shell").then((m) => ({ default: m.PublicPageShell })),
  { ssr: false },
);

interface SharedPage {
  id: string;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  content: unknown[];
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const { data, isLoading, error } = useQuery<SharedPage>({
    queryKey: ["public-share", token],
    queryFn: () => api.publicPages.getByShareToken(token),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="mt-2 text-muted-foreground">
            This shared link may have expired or been revoked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PublicPageShell
      title={data.title}
      icon={data.icon}
      coverUrl={data.coverUrl}
      content={data.content}
    />
  );
}
