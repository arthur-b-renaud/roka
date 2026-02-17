"use client";

import { ToolsSection } from "@/components/settings/tools-section";
import { Separator } from "@/components/ui/separator";
import { Wrench } from "lucide-react";

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Wrench className="h-6 w-6" />
          Tools
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage agent tools and connect LangChain community integrations
        </p>
      </div>

      <Separator />

      <ToolsSection />
    </div>
  );
}
