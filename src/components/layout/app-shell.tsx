"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { MiniPlayer } from "./mini-player";
import { AudioEngine } from "@/components/player/audio-engine";
import { Sheet } from "@/components/ui/sheet";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const hasTrack = usePlayerStore((state) => state.queue.length > 0);

  const immersive = pathname.startsWith("/shorts");
  // The watch page has its own player: a floating mini player there would cover
  // the controls (and duplicated the old layout jump).
  const showMini = hasTrack && !pathname.startsWith("/watch") && !immersive;

  return (
    <div
      className="flex min-h-[100svh] flex-col"
      data-mini={showMini ? "true" : "false"}
      data-nav={immersive ? "false" : "true"}
    >
      <TopBar />
      <div className="flex flex-1">
        {!immersive ? <Sidebar /> : null}
        <main
          className={cn(
            "min-w-0 flex-1",
            immersive ? "" : "px-3 pt-1 md:px-6 md:pb-6",
            !immersive && "pb-[var(--shell-pad-bottom)]",
          )}
          style={immersive ? undefined : { paddingBottom: "var(--shell-pad-bottom)" }}
        >
          {children}
        </main>
      </div>
      {!immersive ? <BottomNav /> : null}
      <MiniPlayer open={showMini} />
      <AudioEngine />
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} side="left" title="Menu">
        <Sidebar variant="drawer" />
      </Sheet>
    </div>
  );
}
