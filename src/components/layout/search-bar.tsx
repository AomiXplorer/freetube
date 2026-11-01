"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock, Search, X, ArrowLeft, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { useSearchHistory } from "@/db/hooks";
import { useUIStore } from "@/store/ui";

async function fetchSuggestions(query: string): Promise<string[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { suggestions?: string[] };
  return json.suggestions ?? [];
}

export function SearchBar({ autoFocus = false, className }: { autoFocus?: boolean; className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { entries, add } = useSearchHistory(8);
  const setMobileSearchOpen = useUIStore((state) => state.setMobileSearchOpen);
  const mobileSearchOpen = useUIStore((state) => state.mobileSearchOpen);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["suggest", query],
    queryFn: () => fetchSuggestions(query),
    enabled: query.trim().length > 1,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const items = query.trim().length > 1 ? suggestions : entries.map((entry) => entry.query);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await add(trimmed);
    setOpen(false);
    setMobileSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit(highlighted >= 0 ? (items[highlighted] ?? query) : query);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((value) => Math.min(value + 1, items.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((value) => Math.max(value - 1, -1));
    }
    if (event.key === "Escape") {
      setOpen(false);
      setMobileSearchOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex w-full items-center gap-2", className)}
      data-mobile-open={mobileSearchOpen || undefined}
    >
      {mobileSearchOpen ? (
        <button
          type="button"
          aria-label="Back"
          className="rounded-full p-2 hover:bg-accent md:hidden"
          onClick={() => setMobileSearchOpen(false)}
        >
          <ArrowLeft className="size-5" />
        </button>
      ) : null}

      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <div className="relative flex flex-1 items-center">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setHighlighted(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search"
            aria-label="Search videos"
            className="h-10 w-full rounded-l-full border border-input bg-background py-2 pl-4 pr-10 text-sm outline-none focus:border-blue-500 md:w-[min(540px,100%)]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 rounded-full p-1 hover:bg-accent"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          aria-label="Search"
          className="flex h-10 items-center justify-center rounded-r-full border border-l-0 border-input bg-secondary px-5 transition-colors hover:bg-accent"
        >
          <Search className="size-5" />
        </button>
      </form>

      {open && items.length ? (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-popover py-2 shadow-2xl">
          {items.map((item, index) => (
            <button
              key={`${item}-${index}`}
              type="button"
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => submit(item)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent",
                highlighted === index && "bg-accent",
              )}
            >
              {query.trim().length > 1 ? (
                <Search className="size-4 text-muted-foreground" />
              ) : index === 0 ? (
                <TrendingUp className="size-4 text-muted-foreground" />
              ) : (
                <Clock className="size-4 text-muted-foreground" />
              )}
              <span className="truncate">{item}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
