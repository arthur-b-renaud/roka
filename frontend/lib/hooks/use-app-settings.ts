import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { AppSetting } from "@/lib/types/database";

/**
 * Read non-secret app_settings (works with anon key too).
 */
export function useAppSettings() {
  const supabase = useSupabase();
  return useQuery<Record<string, string>>({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .eq("is_secret", false);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as AppSetting[]) {
        map[row.key] = row.value;
      }
      return map;
    },
    staleTime: 30_000,
  });
}

/**
 * Check if setup is complete (readable by anon).
 */
export function useSetupComplete() {
  const { data: appSettings } = useAppSettings();
  // Derive configured state from provider (ollama always true) or explicit flag
  const llmConfigured = appSettings?.llm_provider === "ollama" || 
    (appSettings?.llm_configured === "true" && !!appSettings?.llm_provider);

  return {
    setupComplete: appSettings?.setup_complete === "true",
    llmConfigured,
    isLoading: !appSettings,
  };
}

/**
 * Upsert multiple app_settings rows at once.
 */
export function useUpdateAppSettings() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: { key: string; value: string; is_secret?: boolean }[]) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          settings.map((s) => ({
            key: s.key,
            value: s.value,
            is_secret: s.is_secret ?? false,
          }))
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });
}
