"use client";

import { useCallback, useRef } from "react";
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
