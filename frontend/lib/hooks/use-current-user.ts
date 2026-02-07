import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";

export function useCurrentUser() {
  const supabase = useSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return { userId, loading };
}
