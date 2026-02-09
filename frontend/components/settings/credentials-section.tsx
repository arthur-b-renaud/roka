"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dbCredentialSchema, type DbCredential } from "@/lib/types/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Plus,
  Trash2,
  X,
  Key,
  Mail,
  Globe,
  Lock,
} from "lucide-react";
import { z } from "zod";

const credentialsArraySchema = z.array(dbCredentialSchema);

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  llm: <Globe className="h-4 w-4" />,
  smtp: <Mail className="h-4 w-4" />,
  openai: <Globe className="h-4 w-4" />,
  default: <Key className="h-4 w-4" />,
};

const CREDENTIAL_TEMPLATES: { service: string; type: string; label: string; fields: string[] }[] = [
  { service: "llm", type: "api_key", label: "LLM / AI Provider", fields: ["provider", "model", "api_key", "api_base"] },
  { service: "smtp", type: "smtp", label: "Email / SMTP", fields: ["host", "port", "user", "password", "from_email"] },
  { service: "custom", type: "api_key", label: "Custom API Key", fields: ["api_key"] },
];

export function CredentialsSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [formName, setFormName] = useState("");
  const [formFields, setFormFields] = useState<Record<string, string>>({});

  const { data: credentials = [], isLoading } = useQuery<DbCredential[]>({
    queryKey: ["credentials"],
    queryFn: async () => {
      const data = await api.credentials.list();
      return credentialsArraySchema.parse(data);
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const template = CREDENTIAL_TEMPLATES[selectedTemplate];
      return api.credentials.create({
        name: formName,
        service: template.service,
        type: template.type,
        config: formFields,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      setShowForm(false);
      setFormName("");
      setFormFields({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.credentials.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  const template = CREDENTIAL_TEMPLATES[selectedTemplate];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-4 w-4" />
          Credentials Vault
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "Add Credential"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Encrypted secrets for LLM, SMTP, and external API integrations. Secrets are encrypted at rest.
      </p>

      {/* Credential list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : credentials.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Lock className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No credentials configured yet.
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {SERVICE_ICONS[cred.service] || SERVICE_ICONS.default}
                <div>
                  <p className="text-sm font-medium">{cred.name}</p>
                  <p className="text-xs text-muted-foreground">{cred.service} / {cred.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={cred.isActive ? "default" : "secondary"} className="text-xs">
                  {cred.isActive ? "Active" : "Disabled"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(cred.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add credential form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex gap-2">
              {CREDENTIAL_TEMPLATES.map((t, i) => (
                <button
                  key={t.service}
                  type="button"
                  onClick={() => { setSelectedTemplate(i); setFormFields({}); }}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selectedTemplate === i
                      ? "border-primary bg-primary/5 font-medium"
                      : "hover:bg-accent/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cred-name">Name</Label>
            <Input
              id="cred-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={`My ${template.label}`}
              className="max-w-sm"
            />
          </div>

          {template.fields.map((field) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`cred-${field}`}>
                {field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </Label>
              <Input
                id={`cred-${field}`}
                type={field.includes("key") || field.includes("password") || field.includes("secret") ? "password" : "text"}
                value={formFields[field] || ""}
                onChange={(e) => setFormFields({ ...formFields, [field]: e.target.value })}
                placeholder={field}
                className="max-w-sm"
              />
            </div>
          ))}

          <Button
            onClick={() => createMutation.mutate()}
            disabled={!formName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Saving..." : "Save Credential"}
          </Button>
        </div>
      )}
    </section>
  );
}
