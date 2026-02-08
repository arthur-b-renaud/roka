"use client";

import { ReactNode } from "react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  DragHandleMenu,
  RemoveBlockItem,
  BlockColorsItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from "@blocknote/react";
import {
  Trash2,
  Copy,
  ArrowRightLeft,
  Link2,
  MoveRight,
} from "lucide-react";

// --- Custom menu items ---

function DuplicateBlockItem({ children }: { children: ReactNode }) {
  const editor = useBlockNoteEditor<any, any, any>();
  const Components = useComponentsContext()!;
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });

  if (!block) return null;

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<Copy className="h-4 w-4" />}
      onClick={() => {
        const serialized = JSON.parse(JSON.stringify(block));
        delete serialized.id;
        editor.insertBlocks([serialized], block, "after");
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

function TurnIntoItem({ children }: { children: ReactNode }) {
  const editor = useBlockNoteEditor<any, any, any>();
  const Components = useComponentsContext()!;
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });

  if (!block) return null;

  const blockTypes = [
    { label: "Text", type: "paragraph" as const },
    { label: "Heading 1", type: "heading" as const, props: { level: 1 } },
    { label: "Heading 2", type: "heading" as const, props: { level: 2 } },
    { label: "Heading 3", type: "heading" as const, props: { level: 3 } },
    { label: "Bullet list", type: "bulletListItem" as const },
    { label: "Numbered list", type: "numberedListItem" as const },
    { label: "Check list", type: "checkListItem" as const },
  ];

  return (
    <Components.Generic.Menu.Root position="right" sub={true}>
      <Components.Generic.Menu.Trigger sub={true}>
        <Components.Generic.Menu.Item
          className="bn-menu-item"
          subTrigger={true}
          icon={<ArrowRightLeft className="h-4 w-4" />}
        >
          {children}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown">
        {blockTypes.map((bt) => (
          <Components.Generic.Menu.Item
            key={bt.label}
            className="bn-menu-item"
            onClick={() => {
              editor.updateBlock(block, {
                type: bt.type,
                props: bt.props as Record<string, string | number>,
              });
            }}
          >
            {bt.label}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

function CopyLinkItem({ children }: { children: ReactNode }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });

  if (!block) return null;

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      icon={<Link2 className="h-4 w-4" />}
      onClick={() => {
        const url = `${window.location.href}#${block.id}`;
        navigator.clipboard.writeText(url);
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

// --- Assembled menu ---

export const NotionDragHandleMenu = () => (
  <DragHandleMenu>
    <RemoveBlockItem>
      <div className="flex w-full items-center gap-2">
        <Trash2 className="h-4 w-4 shrink-0" />
        <span className="flex-1">Delete</span>
        <kbd className="ml-auto text-[11px] text-muted-foreground">Del</kbd>
      </div>
    </RemoveBlockItem>
    <DuplicateBlockItem>
      <span className="flex-1">Duplicate</span>
    </DuplicateBlockItem>
    <TurnIntoItem>Turn into</TurnIntoItem>
    <CopyLinkItem>Copy link to block</CopyLinkItem>
    <BlockColorsItem>
      <div className="flex items-center gap-2">
        <span>Color</span>
      </div>
    </BlockColorsItem>
  </DragHandleMenu>
);
