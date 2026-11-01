"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Search, Settings, Sun, Cast } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "./logo";
import { SearchBar } from "./search-bar";
import { useUIStore } from "@/store/ui";
import { useTheme } from "@/components/providers";
import { usePlayerStore } from "@/store/player";

export function TopBar() {
  const pathname = usePathname();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setMobileSearchOpen = useUIStore((state) => state.setMobileSearchOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const mobileSearchOpen = useUIStore((state) => state.mobileSearchOpen);
  const { resolved, setTheme } = useTheme();
  const setMiniOpen = usePlayerStore((state) => state.setMiniOpen);
  const queueLength = usePlayerStore((state) => state.queue.length);

  const isWatch = pathname.startsWith("/watch");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center gap-2 bg-background/95 px-3 backdrop-blur md:px-4",
        isWatch && "md:bg-background",
      )}
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex items-center gap-1 md:gap-2">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => (window.innerWidth < 768 ? setSidebarOpen(true) : toggleSidebar())}
          className="hidden rounded-full p-2 hover:bg-accent md:flex"
        >
          <Menu className="size-5" />
        </button>
        <Logo />
      </div>

      <div className={cn("mx-auto hidden flex-1 justify-center md:flex", isWatch && "max-w-2xl")}>
        <SearchBar />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Search"
          onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
          className="rounded-full p-2 hover:bg-accent md:hidden"
        >
          <Search className="size-5" />
        </button>
        {queueLength > 0 ? (
          <button
            type="button"
            aria-label="Open queue"
            onClick={() => setMiniOpen(true)}
            className="rounded-full p-2 hover:bg-accent"
          >
            <Cast className="size-5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
          className="rounded-full p-2 hover:bg-accent"
        >
          {resolved === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <Link
          href="/settings"
          aria-label="Settings"
          className="rounded-full p-2 hover:bg-accent"
        >
          <Settings className="size-5" />
        </Link>
      </div>

      {mobileSearchOpen ? (
        <div className="absolute inset-x-0 top-0 z-50 flex h-14 items-center gap-2 bg-background px-3 md:hidden">
          <SearchBar autoFocus />
        </div>
      ) : null}
    </header>
  );
}
