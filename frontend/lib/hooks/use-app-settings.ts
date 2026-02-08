import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Read non-secret app_settings.
 */
export function useAppSettings() {
  return useQuery<Record<string, string>>({
    queryKey: ["app-settings"],
    queryFn: () => api.appSettings.get(),
    staleTime: 30_000,
  });
}

/**
 * Check if setup is complete.
 */
export function useSetupComplete() {
  const { data: appSettings } = useAppSettings();
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: { key: string; value: string; is_secret?: boolean }[]) => {
      await api.appSettings.update(settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });
}
