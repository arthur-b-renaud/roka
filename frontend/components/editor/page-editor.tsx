"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import type { DbNode } from "@/lib/types/database";

interface PageEditorProps {
  node: DbNode;
}

export function PageEditor({ node }: PageEditorProps) {
  const supabase = useSupabase();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // node.content is BlockNote Block[] serialized as JSON
  const initialContent =
    Array.isArray(node.content) && node.content.length > 0
      ? (node.content as Block[])
      : undefined;

  const editor = useCreateBlockNote({ initialContent });

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const blocks = editor.document;
      await supabase
        .from("nodes")
        .update({ content: JSON.parse(JSON.stringify(blocks)) })
        .eq("id", node.id);
    }, 1000);
  }, [editor, supabase, node.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (matches: boolean) => {
      setTheme(matches ? "dark" : "light");
    };
    applyTheme(media.matches);
    const handler = (event: MediaQueryListEvent) => applyTheme(event.matches);
    if (media.addEventListener) {
      media.addEventListener("change", handler);
    } else {
      media.addListener(handler);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handler);
      } else {
        media.removeListener(handler);
      }
    };
  }, []);

  return (
    <div className="min-h-[500px]">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={theme}
      />
    </div>
  );
}
