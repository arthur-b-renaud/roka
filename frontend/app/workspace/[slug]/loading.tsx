import { Skeleton } from "@/components/ui/skeleton";

export default function NodePageLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-8 pt-4 pb-8">
      <nav className="mb-4 flex items-center gap-1">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </nav>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
    </div>
  );
}
