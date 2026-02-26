"use client";

import { useEffect, useMemo, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/mantine/style.css";

interface PublicPageShellProps {
  title: string;
  icon?: string | null;
  coverUrl?: string | null;
  content: unknown[];
}

export function PublicPageShell({ title, icon, coverUrl, content }: PublicPageShellProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const initialContent = useMemo(
    () => (Array.isArray(content) && content.length > 0 ? (content as Block[]) : undefined),
    [content],
  );

  const editor = useCreateBlockNote({ initialContent });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setTheme(media.matches ? "dark" : "light");
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      {coverUrl && (
        <div className="mb-6 h-[220px] w-full overflow-hidden rounded-lg">
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <header className="mb-6 space-y-2">
        {icon && <span className="text-4xl">{icon}</span>}
        <h1 className="text-4xl font-bold tracking-tight">{title || "Untitled"}</h1>
      </header>

      <div className="pointer-events-none min-h-[300px]">
        <BlockNoteView editor={editor} editable={false} theme={theme} />
      </div>

      <footer className="mt-12 border-t pt-4 text-center text-xs text-muted-foreground">
        Published with Roka
      </footer>
    </article>
  );
}
