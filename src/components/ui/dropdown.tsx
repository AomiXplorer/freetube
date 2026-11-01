"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

type DropdownContextValue = { close: () => void };
const DropdownContext = React.createContext<DropdownContextValue>({ close: () => undefined });

export function Dropdown({ trigger, children, align = "end", className }: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <div onClick={() => setOpen((value) => !value)} className="contents">
        {trigger}
      </div>
      {open ? (
        <DropdownContext.Provider value={{ close: () => setOpen(false) }}>
          <div
            role="menu"
            className={cn(
              "absolute top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-slide-up",
              align === "end" ? "right-0" : "left-0",
              className,
            )}
          >
            {children}
          </div>
        </DropdownContext.Provider>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  active,
  icon,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  const { close } = React.useContext(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        close();
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent",
        active && "font-medium text-foreground",
      )}
    >
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {active ? <span className="text-xs text-muted-foreground">✓</span> : null}
    </button>
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">{children}</div>;
}
