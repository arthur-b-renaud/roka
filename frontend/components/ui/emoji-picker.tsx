"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊",
      "😇","🥰","😍","🤩","😘","😋","😛","🤔","🤗","🤫",
      "😐","😑","😶","🙄","😏","😬","😌","😔","😪","🤤",
      "😷","🤒","🤕","🤢","🤮","🥵","🥶","😵","🤯","🥳",
    ],
  },
  {
    label: "People",
    emojis: [
      "👋","🤚","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰",
      "🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎",
      "✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🙏",
      "💪","🦾","🧠","👀","👁️","👅","👄","💋","👶","🧑",
    ],
  },
  {
    label: "Nature",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦆",
      "🦋","🐛","🐝","🐞","🦀","🐙","🐚","🐌","🌸","🌺",
      "🌻","🌹","🌷","🌱","🌲","🌳","🍀","🍁","🍂","🍃",
    ],
  },
  {
    label: "Food",
    emojis: [
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈",
      "🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🥦","🥬",
      "🌽","🥕","🧅","🥔","🍞","🥐","🥖","🧀","🍕","🍔",
      "🌮","🍣","🍱","🍩","🍪","🎂","🍰","🧁","🍫","🍬",
    ],
  },
  {
    label: "Activities",
    emojis: [
      "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱",
      "🏓","🏸","🥊","🥋","⛳","🎯","🎮","🕹️","🎲","🧩",
      "🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺",
    ],
  },
  {
    label: "Travel",
    emojis: [
      "🚗","🚕","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻",
      "🚚","🚛","🚜","🏍️","🚲","🛵","🛴","✈️","🚀","🛸",
      "🚁","⛵","🚤","🛥️","🗼","🏰","🏠","🏢","🏗️","🌍",
    ],
  },
  {
    label: "Objects",
    emojis: [
      "⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","💾","📀","📸",
      "🔭","🔬","💡","🔦","📕","📗","📘","📙","📓","📔",
      "📒","📚","📖","🔗","📎","✂️","🗑️","📌","📍","🏷️",
      "✏️","🖊️","🖋️","✒️","📝","💼","📁","📂","🗂️","📊",
      "📈","📉","🔒","🔑","🛠️","⚙️","🧲","🧪","🧫","💎",
    ],
  },
  {
    label: "Symbols",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❣️","💕","💞","💓","💗","💖","💘","💝","⭐","🌟",
      "💫","✨","⚡","🔥","💥","🎉","🎊","✅","❌","⚠️",
      "💯","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤",
    ],
  },
  {
    label: "Flags",
    emojis: [
      "🏳️","🏴","🚩","🏁","🇫🇷","🇺🇸","🇬🇧","🇩🇪","🇪🇸","🇮🇹",
      "🇯🇵","🇰🇷","🇨🇳","🇧🇷","🇮🇳","🇷🇺","🇨🇦","🇦🇺","🇲🇽","🇵🇹",
    ],
  },
];

interface EmojiPickerProps {
  value: string | null;
  onChange: (emoji: string | null) => void;
  children: React.ReactNode;
  side?: "bottom" | "right" | "top" | "left";
  align?: "start" | "center" | "end";
}

export function EmojiPicker({
  value,
  onChange,
  children,
  side = "bottom",
  align = "start",
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter) return EMOJI_CATEGORIES;
    // Simple filter: show all emojis in categories whose label matches, or just show all emojis
    const q = filter.toLowerCase();
    return EMOJI_CATEGORIES.map((cat) => ({
      ...cat,
      emojis: cat.label.toLowerCase().includes(q) ? cat.emojis : [],
    })).filter((cat) => cat.emojis.length > 0);
  }, [filter]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onChange(emoji);
      setOpen(false);
      setFilter("");
    },
    [onChange]
  );

  const handleRemove = useCallback(() => {
    onChange(null);
    setOpen(false);
    setFilter("");
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[320px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Emoji
          </span>
          {value && (
            <button
              onClick={handleRemove}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Remove
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-full rounded-md border bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>

        {/* Grid */}
        <div className="max-h-[280px] overflow-y-auto px-3 py-2">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No emojis found.
            </p>
          )}
          {filtered.map((cat) => (
            <div key={cat.label} className="mb-2">
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                {cat.label}
              </p>
              <div className="grid grid-cols-10 gap-0.5">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSelect(emoji)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded text-base transition-colors hover:bg-accent",
                      value === emoji && "bg-accent ring-1 ring-ring"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
