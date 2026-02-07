"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useAppSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings, User, Key, Bot, Eye, EyeOff, Check, AlertCircle } from "lucide-react";

import { PROVIDERS } from "@/lib/constants/providers";

export default function SettingsPage() {
  const supabase = useSupabase();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // LLM settings
  const { data: appSettings, isLoading: settingsLoading } = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [llmMessage, setLlmMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, [supabase]);

  // Load current LLM settings from DB
  useEffect(() => {
    if (appSettings) {
      if (appSettings.llm_provider) setProvider(appSettings.llm_provider);
      if (appSettings.llm_model) setModel(appSettings.llm_model);
      if (appSettings.llm_api_base) setApiBase(appSettings.llm_api_base);
      // API key is secret -- we can't read it from anon.
      // Leave apiKey blank; user re-enters to change.
    }
  }, [appSettings]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const newPassword = formData.get("new-password") as string;

    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password updated successfully");
      (e.target as HTMLFormElement).reset();
    }
    setLoading(false);
  };

  const handleSaveLLM = async () => {
    setLlmMessage(null);
    const selectedProvider = PROVIDERS.find((p) => p.id === provider);
    const hasKey = provider === "ollama" || (!selectedProvider?.needsKey || apiKey.trim().length > 0);

    const settingsToUpdate: { key: string; value: string; is_secret?: boolean }[] = [
      { key: "llm_provider", value: provider },
      { key: "llm_model", value: model },
      { key: "llm_api_base", value: apiBase },
      { key: "llm_configured", value: hasKey ? "true" : "false" },
    ];

    // Only update API key if user entered a new one
    if (apiKey.trim()) {
      settingsToUpdate.push({ key: "llm_api_key", value: apiKey, is_secret: true });
    }

    try {
      await updateSettings.mutateAsync(settingsToUpdate);
      setLlmMessage("LLM settings saved");
      setApiKey(""); // Clear after save
    } catch {
      setLlmMessage("Failed to save settings");
    }
  };

    const isLlmConfigured = appSettings?.llm_provider === "ollama" || 
      (appSettings?.llm_configured === "true" && !!appSettings?.llm_provider);
  const selectedProvider = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage your workspace settings
        </p>
      </div>

      <Separator />

      {/* AI / LLM */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="h-4 w-4" />
            AI / LLM
          </h2>
          <div className="flex items-center gap-1.5">
            {isLlmConfigured ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-600">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-amber-500">Not configured</span>
              </>
            )}
          </div>
        </div>

        {settingsLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProvider(p.id);
                      if (p.id === "openai") setModel("gpt-4o");
                      else if (p.id === "ollama") setModel("llama3");
                      else setModel("anthropic/claude-3.5-sonnet");
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      provider === p.id
                        ? "border-primary bg-primary/5 font-medium"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="llm-model">Model</Label>
              <Input
                id="llm-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4o"
                className="max-w-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="llm-api-base">API Base URL (optional)</Label>
              <Input
                id="llm-api-base"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder={provider === "ollama" ? "http://host.docker.internal:11434" : "https://api.openai.com/v1"}
                className="max-w-sm"
              />
              <p className="text-xs text-muted-foreground">
                For Ollama in Docker, use <code>http://host.docker.internal:11434</code>
              </p>
            </div>

            {selectedProvider?.needsKey && (
              <div className="space-y-2">
                <Label htmlFor="llm-api-key">
                  API Key
                  {isLlmConfigured && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (leave blank to keep current key)
                    </span>
                  )}
                </Label>
                <div className="relative max-w-sm">
                  <Input
                    id="llm-api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={isLlmConfigured ? "********" : selectedProvider.placeholder}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {llmMessage && (
              <p className="text-sm text-muted-foreground">{llmMessage}</p>
            )}

            <Button
              onClick={handleSaveLLM}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? "Saving..." : "Save LLM Settings"}
            </Button>
          </div>
        )}
      </section>

      <Separator />

      {/* Profile */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <User className="h-4 w-4" />
          Profile
        </h2>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} disabled className="max-w-sm" />
        </div>
      </section>

      <Separator />

      {/* Change Password */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Key className="h-4 w-4" />
          Change Password
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              placeholder="At least 6 characters"
              className="max-w-sm"
              required
            />
          </div>
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </section>

      <Separator />

      {/* Keyboard Shortcuts */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-2">
            <span>Search</span>
            <kbd className="rounded bg-background px-2 py-1 text-xs font-mono shadow-sm">
              Cmd + K
            </kbd>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-2">
            <span>New Page</span>
            <kbd className="rounded bg-background px-2 py-1 text-xs font-mono shadow-sm">
              Cmd + N
            </kbd>
          </div>
        </div>
      </section>
    </div>
  );
}
