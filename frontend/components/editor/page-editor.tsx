"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import type { DbNode } from "@/lib/types/database";

/** Recursively extract plain text from BlockNote block array. */
function extractBlockText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.content && Array.isArray(block.content)) {
      for (const inline of block.content) {
        if (typeof inline === "object" && inline !== null && "text" in inline) {
          parts.push((inline as { text: string }).text);
        }
      }
    }
    if (block.children && Array.isArray(block.children)) {
      parts.push(extractBlockText(block.children));
    }
  }
  return parts.join(" ").trim();
}

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
      // Extract plain text from BlockNote blocks for search indexing
      const plainText = extractBlockText(blocks);
      const searchText = `${node.title} ${plainText}`.slice(0, 10000);
      await supabase
        .from("nodes")
        .update({
          content: JSON.parse(JSON.stringify(blocks)),
          search_text: searchText,
        })
        .eq("id", node.id);
    }, 1000);
  }, [editor, supabase, node.id, node.title]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
