"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FileText, Database } from "lucide-react";
import { nodeUrl } from "@/lib/slug";
import type { SearchResult } from "@/lib/types/database";

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Search debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.search(query, 20);
        setResults(data as SearchResult[]);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      router.push(nodeUrl(result.title, result.id));
      setOpen(false);
      setQuery("");
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        navigateToResult(results[selectedIndex]);
      }
    },
    [results, selectedIndex, navigateToResult]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg" aria-label="Search pages">
        <DialogHeader>
          <DialogTitle className="sr-only">Search</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            placeholder="Search pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            aria-label="Search query"
            role="combobox"
            aria-expanded={results.length > 0}
          />
          {results.length > 0 && (
            <div className="sr-only" aria-live="polite">
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </div>
          )}
          <div className="max-h-80 overflow-auto" role="listbox">
            {loading && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Searching...
              </p>
            )}
            {!loading && query && results.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No results found.
              </p>
            )}
            {results.map((result, index) => (
              <button
                key={result.id}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => navigateToResult(result)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
              >
                {result.type === "database" ? (
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium">{result.title || "Untitled"}</span>
                  {result.snippet && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {result.snippet.split(/(<mark>.*?<\/mark>)/g).map((part, i) => {
                        if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
                          return (
                            <span key={i} className="font-medium text-foreground">
                              {part.replace(/<\/?mark>/g, "")}
                            </span>
                          );
                        }
                        return <span key={i}>{part}</span>;
                      })}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
