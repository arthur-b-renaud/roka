"use client";

import { useEffect, useMemo, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/mantine/style.css";

interface ReadOnlyEditorProps {
  content: unknown[];
}

export function ReadOnlyEditor({ content }: ReadOnlyEditorProps) {
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
    <div className="pointer-events-none min-h-[300px]">
      <BlockNoteView editor={editor} editable={false} theme={theme} />
    </div>
  );
}
