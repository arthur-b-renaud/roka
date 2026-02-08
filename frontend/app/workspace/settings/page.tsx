"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAppSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings, User, Key, Bot, Eye, EyeOff, Check, AlertCircle, Mail } from "lucide-react";

import { PROVIDERS } from "@/lib/constants/providers";

export default function SettingsPage() {
  const { data: session } = useSession();
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

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null);

  // Load current LLM + SMTP settings from DB
  const [initialized, setInitialized] = useState(false);
  if (appSettings && !initialized) {
    if (appSettings.llm_provider) setProvider(appSettings.llm_provider);
    if (appSettings.llm_model) setModel(appSettings.llm_model);
    if (appSettings.llm_api_base) setApiBase(appSettings.llm_api_base);
    if (appSettings.smtp_host) setSmtpHost(appSettings.smtp_host);
    if (appSettings.smtp_port) setSmtpPort(appSettings.smtp_port);
    if (appSettings.smtp_user) setSmtpUser(appSettings.smtp_user);
    if (appSettings.smtp_from_email) setSmtpFromEmail(appSettings.smtp_from_email);
    setInitialized(true);
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const newPassword = formData.get("new-password") as string;

    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });

    if (res.ok) {
      setMessage("Password updated successfully");
      (e.target as HTMLFormElement).reset();
    } else {
      const data = await res.json();
      setMessage(data.error || "Failed to update password");
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

    if (apiKey.trim()) {
      settingsToUpdate.push({ key: "llm_api_key", value: apiKey, is_secret: true });
    }

    try {
      await updateSettings.mutateAsync(settingsToUpdate);
      setLlmMessage("LLM settings saved");
      setApiKey("");
    } catch {
      setLlmMessage("Failed to save settings");
    }
  };

  const isLlmConfigured = appSettings?.llm_provider === "ollama" || 
      (appSettings?.llm_configured === "true" && !!appSettings?.llm_provider);
  const selectedProvider = PROVIDERS.find((p) => p.id === provider);
  const isSmtpConfigured = !!(appSettings?.smtp_host && appSettings?.smtp_from_email);

  const handleSaveSMTP = async () => {
    setSmtpMessage(null);
    const settingsToUpdate: { key: string; value: string; is_secret?: boolean }[] = [
      { key: "smtp_host", value: smtpHost },
      { key: "smtp_port", value: smtpPort },
      { key: "smtp_user", value: smtpUser },
      { key: "smtp_from_email", value: smtpFromEmail },
    ];
    if (smtpPassword.trim()) {
      settingsToUpdate.push({ key: "smtp_password", value: smtpPassword, is_secret: true });
    }
    try {
      await updateSettings.mutateAsync(settingsToUpdate);
      setSmtpMessage("SMTP settings saved");
      setSmtpPassword("");
    } catch {
      setSmtpMessage("Failed to save SMTP settings");
    }
  };

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
              <div role="radiogroup" aria-label="LLM Provider" className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={provider === p.id}
                    onClick={() => {
                      setProvider(p.id);
                      if (p.id === "openai") setModel("gpt-4o");
                      else if (p.id === "ollama") setModel("llama3");
                      else setModel("anthropic/claude-3.5-sonnet");
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
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
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{llmMessage}</p>
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

      {/* SMTP / Email */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="h-4 w-4" />
            Email / SMTP
          </h2>
          <div className="flex items-center gap-1.5">
            {isSmtpConfigured ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-600">Configured</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Optional</span>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure SMTP to let the agent send outbound emails.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-from">From Email</Label>
            <Input
              id="smtp-from"
              value={smtpFromEmail}
              onChange={(e) => setSmtpFromEmail(e.target.value)}
              placeholder="you@example.com"
              className="max-w-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-user">Username (optional)</Label>
            <Input
              id="smtp-user"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="your-email@example.com"
              className="max-w-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-password">
              Password
              {isSmtpConfigured && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (leave blank to keep current)
                </span>
              )}
            </Label>
            <div className="relative max-w-sm">
              <Input
                id="smtp-password"
                type={showSmtpPassword ? "text" : "password"}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={isSmtpConfigured ? "********" : "App password or SMTP password"}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                aria-label={showSmtpPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
              >
                {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {smtpMessage && (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{smtpMessage}</p>
          )}

          <Button
            onClick={handleSaveSMTP}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? "Saving..." : "Save SMTP Settings"}
          </Button>
        </div>
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
          <Input value={session?.user?.email ?? ""} disabled className="max-w-sm" />
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
              aria-describedby={message ? "password-message" : undefined}
            />
          </div>
          {message && (
            <p id="password-message" role="alert" className="text-sm text-muted-foreground">{message}</p>
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
