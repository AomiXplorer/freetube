"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { MiniPlayer } from "./mini-player";
import { Sheet } from "@/components/ui/sheet";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const setMiniOpen = usePlayerStore((state) => state.setMiniOpen);
  const queueLength = usePlayerStore((state) => state.queue.length);

  // Navigating away from a video keeps audio in the mini player, like YouTube.
  useEffect(() => {
    if (!pathname.startsWith("/watch") && queueLength > 0) setMiniOpen(true);
  }, [pathname, queueLength, setMiniOpen]);

  const immersive = pathname.startsWith("/shorts");

  return (
    <div className="min-h-dvh">
      <TopBar />
      <div className="flex">
        {!immersive ? <Sidebar /> : null}
        <main
          className={cn(
            "min-w-0 flex-1",
            immersive ? "" : "px-3 pb-28 pt-1 md:px-6 md:pb-12",
            !immersive && collapsed ? "" : "",
          )}
        >
          {children}
        </main>
      </div>
      {!immersive ? <BottomNav /> : null}
      <MiniPlayer />
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} side="left" title="Menu">
        <Sidebar variant="drawer" />
      </Sheet>
    </div>
  );
}
