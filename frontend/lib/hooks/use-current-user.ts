import { useSession } from "next-auth/react";

export function useCurrentUser() {
  const { data: session, status } = useSession();
  return {
    userId: session?.user?.id ?? null,
    loading: status === "loading",
  };
}
