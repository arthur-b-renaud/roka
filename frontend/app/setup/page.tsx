"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useSetupComplete, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, ChevronRight, Eye, EyeOff } from "lucide-react";

import { PROVIDERS } from "@/lib/constants/providers";

type Step = "account" | "llm" | "done";

export default function SetupPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { setupComplete, isLoading } = useSetupComplete();
  const updateSettings = useUpdateAppSettings();

  const [step, setStep] = useState<Step>("account");

  // Account fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // LLM fields
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Redirect if already set up
  useEffect(() => {
    if (!isLoading && setupComplete) {
      router.replace("/workspace");
    }
  }, [isLoading, setupComplete, router]);

  // If user is already signed in, skip to LLM step
  useEffect(() => {
    if (session?.user) {
      setStep("llm");
    }
  }, [session]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (password !== confirmPassword) {
      setAuthError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters");
      return;
    }

    setAuthLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setAuthError(data.error || "Signup failed");
      setAuthLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setAuthError("Account created but sign-in failed");
      setAuthLoading(false);
      return;
    }

    setAuthLoading(false);
    setStep("llm");
  };

  const handleSaveLLM = async () => {
    const selectedProvider = PROVIDERS.find((p) => p.id === provider);
    const hasKey = provider === "ollama" || (!selectedProvider?.needsKey || apiKey.trim().length > 0);

    await updateSettings.mutateAsync([
      { key: "llm_provider", value: provider },
      { key: "llm_model", value: model },
      { key: "llm_api_key", value: apiKey, is_secret: true },
      { key: "llm_api_base", value: apiBase },
      { key: "llm_configured", value: hasKey ? "true" : "false" },
      { key: "setup_complete", value: "true" },
    ]);

    setStep("done");
  };

  const handleSkipLLM = async () => {
    await updateSettings.mutateAsync([
      { key: "setup_complete", value: "true" },
    ]);
    setStep("done");
  };

  const handleFinish = () => {
    router.push("/workspace");
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md space-y-8 p-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Roka</h1>
          <p className="text-sm text-muted-foreground">
            Sovereign Agentic Workspace
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2" role="progressbar" aria-label="Setup progress" aria-valuenow={step === "account" ? 1 : step === "llm" ? 2 : 3} aria-valuemin={1} aria-valuemax={3}>
          {(["account", "llm", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                aria-current={step === s ? "step" : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : (["account", "llm", "done"].indexOf(step) > i)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {["account", "llm", "done"].indexOf(step) > i ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step 1: Account */}
        {step === "account" && (
          <form onSubmit={handleSignup} className="space-y-4" aria-label="Create account">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Create your account</h2>
              <p className="text-sm text-muted-foreground">
                This is the first user -- you&apos;ll be the workspace admin.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-describedby={authError ? "setup-error" : undefined}
                aria-invalid={authError ? "true" : "false"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-describedby={authError ? "setup-error" : undefined}
                aria-invalid={authError ? "true" : "false"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                aria-describedby={authError ? "setup-error" : undefined}
                aria-invalid={authError ? "true" : "false"}
              />
            </div>

            {authError && (
              <p id="setup-error" role="alert" className="text-sm text-destructive">{authError}</p>
            )}

            <Button type="submit" className="w-full" disabled={authLoading}>
              {authLoading ? "Creating account..." : "Continue"}
            </Button>
          </form>
        )}

        {/* Step 2: LLM */}
        {step === "llm" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Configure your LLM</h2>
              <p className="text-sm text-muted-foreground">
                Power agent workflows (summarize, triage). You can change this later in Settings.
              </p>
            </div>

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
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4o"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiBase">API Base URL (optional)</Label>
              <Input
                id="apiBase"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder={provider === "ollama" ? "http://host.docker.internal:11434" : "https://api.openai.com/v1"}
              />
              <p className="text-xs text-muted-foreground">
                For Ollama in Docker, use <code>http://host.docker.internal:11434</code>
              </p>
            </div>

            {selectedProvider?.needsKey && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={selectedProvider.placeholder}
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleSkipLLM}
                disabled={updateSettings.isPending}
              >
                Skip for now
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveLLM}
                disabled={updateSettings.isPending}
              >
                {updateSettings.isPending ? "Saving..." : "Save & Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">You&apos;re all set</h2>
              <p className="text-sm text-muted-foreground">
                Your workspace is ready. You can always change LLM settings later.
              </p>
            </div>
            <Button className="w-full" onClick={handleFinish}>
              Go to Workspace
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
