"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings, User, Key } from "lucide-react";

export default function SettingsPage() {
  const supabase = useSupabase();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, [supabase]);

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
