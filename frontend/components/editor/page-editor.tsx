"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/components/providers/supabase-provider";
import { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import type { DbNode } from "@/lib/types/database";

interface PageEditorProps {
  node: DbNode;
}

export function PageEditor({ node }: PageEditorProps) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const editor = useCreateBlockNote({
    initialContent:
      Array.isArray(node.content) && node.content.length > 0
        ? (node.content as Parameters<typeof BlockNoteEditor.create>[0] extends { initialContent: infer T } ? T : never)
        : undefined,
  });

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const blocks = editor.document;
      await supabase
        .from("nodes")
        .update({ content: blocks as unknown as Record<string, unknown> })
        .eq("id", node.id);
    }, 1000);
  }, [editor, supabase, node.id]);

  return (
    <div className="min-h-[500px]">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="light"
      />
    </div>
  );
}
