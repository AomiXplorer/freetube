"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Home, ListVideo, UserSquare2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shorts", label: "Shorts", icon: Film },
  { href: "/subscriptions", label: "Subscriptions", icon: ListVideo },
  { href: "/library", label: "You", icon: UserSquare2 },
];

/**
 * Fixed bottom navigation. Its height is exactly --nav-h plus the safe-area
 * inset, and it never grows when the mini player appears: the mini player is
 * offset above it instead, so nothing stacks or jumps.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="flex h-14 items-stretch">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className={cn("size-5", active && "fill-current")} strokeWidth={active ? 1.5 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
