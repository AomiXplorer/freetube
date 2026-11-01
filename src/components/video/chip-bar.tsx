"use client";

import { cn } from "@/lib/utils/cn";
import type { CategoryChip } from "@/lib/innertube/types";

export function ChipBar({
  chips,
  active,
  onSelect,
  className,
}: {
  chips: CategoryChip[];
  active?: string;
  onSelect: (chip: CategoryChip) => void;
  className?: string;
}) {
  if (!chips.length) return null;
  return (
    <div
      className={cn(
        "sticky top-14 z-20 -mx-3 flex gap-3 overflow-x-auto bg-background/95 px-3 py-2 backdrop-blur scrollbar-none md:top-0 md:mx-0 md:px-0",
        className,
      )}
    >
      {chips.map((chip) => {
        const selected = active ? chip.title === active : chip.selected;
        return (
          <button
            key={`${chip.title}-${chip.params ?? chip.browseId ?? ""}`}
            type="button"
            onClick={() => onSelect(chip)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-foreground text-background"
                : "bg-secondary text-secondary-foreground hover:bg-accent",
            )}
          >
            {chip.title}
          </button>
        );
      })}
    </div>
  );
}
