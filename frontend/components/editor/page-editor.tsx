"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  useCreateBlockNote,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import {
  insertOrUpdateBlockForSlashMenu,
  filterSuggestionItems,
} from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import { NotionDragHandleMenu } from "@/components/editor/drag-handle-menu";
import { nodeUrl } from "@/lib/slug";
import { FilePlus } from "lucide-react";
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const initialContent =
    Array.isArray(node.content) && node.content.length > 0
      ? (node.content as Block[])
      : undefined;

  const editor = useCreateBlockNote({
    initialContent,
    uploadFile: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("nodeId", node.id);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url: string };
      return data.url;
    },
  });

  const getSlashMenuItems = useCallback(
    async (query: string) => {
      const subpageItem = {
        title: "Subpage",
        subtext: "Create a new page nested under this one",
        aliases: ["page", "child", "nested"],
        group: "Basic",
        icon: <FilePlus size={18} />,
        onItemClick: () => {
          api.nodes
            .create({
              parentId: node.id,
              type: "page",
              title: "Untitled",
              content: [],
              properties: {},
            })
            .then((newNode: unknown) => {
              const n = newNode as DbNode;
              queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
              queryClient.invalidateQueries({ queryKey: ["node-children"] });
              insertOrUpdateBlockForSlashMenu(editor, {
                type: "paragraph",
                content: [
                  {
                    type: "link",
                    href: nodeUrl(n.title, n.id),
                    content: [{ type: "text", text: n.title || "Untitled", styles: {} }],
                  },
                ],
              });
              router.push(nodeUrl(n.title, n.id));
            });
        },
      };
      const defaults = getDefaultReactSlashMenuItems(editor);
      const all = [subpageItem, ...defaults];
      return filterSuggestionItems(all, query);
    },
    [editor, node.id, router, queryClient]
  );

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const blocks = editor.document;
      const plainText = extractBlockText(blocks);
      const searchText = `${node.title} ${plainText}`.slice(0, 10000);
      await api.nodes.update(node.id, {
        content: JSON.parse(JSON.stringify(blocks)),
        searchText,
      });
    }, 1000);
  }, [editor, node.id, node.title]);

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
        sideMenu={false}
        slashMenu={false}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
        <SideMenuController
          sideMenu={(props) => (
            <SideMenu {...props} dragHandleMenu={NotionDragHandleMenu} />
          )}
        />
      </BlockNoteView>
    </div>
  );
}
