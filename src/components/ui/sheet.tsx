"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Lightweight drawer (bottom sheet on mobile, side panel on desktop). */
export function Sheet({
  open,
  onOpenChange,
  side = "bottom",
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "bottom" | "left" | "right";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const position =
    side === "bottom"
      ? "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl animate-slide-up"
      : side === "left"
        ? "left-0 top-0 h-full w-[280px]"
        : "right-0 top-0 h-full w-[320px] max-w-[90vw]";

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute overflow-y-auto border-border bg-background p-4 shadow-xl scrollbar-thin",
          side === "bottom" ? "border-t" : "border-r",
          position,
          className,
        )}
        style={side === "bottom" ? { paddingBottom: "calc(var(--safe-bottom) + 1rem)" } : undefined}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">{title}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 hover:bg-accent"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
