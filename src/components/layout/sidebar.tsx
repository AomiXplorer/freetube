"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Compass,
  Film,
  Heart,
  History,
  Home,
  ListVideo,
  Settings,
  ThumbsUp,
  Timer,
  UserSquare2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/store/ui";
import { usePlaylists, useSubscriptions } from "@/db/hooks";
import { bestThumb } from "@/lib/utils/format";
import { Avatar } from "@/components/ui/avatar";

const PRIMARY = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shorts", label: "Shorts", icon: Film },
  { href: "/subscriptions", label: "Subscriptions", icon: ListVideo },
  { href: "/library", label: "You", icon: UserSquare2 },
];

const SECONDARY = [
  { href: "/history", label: "History", icon: History },
  { href: "/library?tab=playlists", label: "Playlists", icon: Compass },
  { href: "/playlist/watch-later", label: "Watch later", icon: Clock },
  { href: "/playlist/liked", label: "Liked videos", icon: ThumbsUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ variant = "rail" }: { variant?: "rail" | "drawer" }) {
  const pathname = usePathname();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const { subscriptions } = useSubscriptions();
  const { playlists } = usePlaylists();

  const compact = variant === "rail" && collapsed;
  const userPlaylists = playlists.filter((playlist) => !playlist.system);

  return (
    <nav
      aria-label="Main"
      className={cn(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-y-auto pb-6 scrollbar-thin md:block",
        compact ? "w-[72px] px-1" : "w-60 px-3",
        variant === "drawer" && "block w-full",
      )}
    >
      <div className="space-y-1 py-2">
        {PRIMARY.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-5 rounded-lg px-3 py-2 text-sm hover:bg-accent",
                active && "bg-accent font-medium",
                compact && "flex-col gap-1 px-0 py-2 text-[10px]",
              )}
            >
              <item.icon className="size-5 shrink-0" />
              <span className={cn(compact && "text-center leading-tight")}>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {!compact ? (
        <>
          <div className="my-3 border-t border-border" />
          <div className="space-y-1">
            {SECONDARY.map((item) => {
              const active = pathname.startsWith(item.href.split("?")[0] as string);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-5 rounded-lg px-3 py-2 text-sm hover:bg-accent",
                    active && pathname === item.href && "bg-accent font-medium",
                  )}
                >
                  <item.icon className="size-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {userPlaylists.length ? (
            <>
              <div className="my-3 border-t border-border" />
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Playlists
              </p>
              <div className="space-y-1">
                {userPlaylists.slice(0, 8).map((playlist) => (
                  <Link
                    key={playlist.id}
                    href={`/playlist/${playlist.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Heart className="size-4 shrink-0" />
                    <span className="truncate">{playlist.name}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          {subscriptions.length ? (
            <>
              <div className="my-3 border-t border-border" />
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Subscriptions
              </p>
              <div className="space-y-1">
                {subscriptions.slice(0, 12).map((subscription) => (
                  <Link
                    key={subscription.channelId}
                    href={`/channel/${subscription.channelId}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Avatar src={bestThumb([{ url: subscription.avatar ?? "" }])} name={subscription.name} size={24} />
                    <span className="truncate">{subscription.name}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <div className="my-3 border-t border-border" />
          <p className="px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
            Freetube is an unofficial client. Video content is served by YouTube.
            <Link href="/settings" className="mt-2 flex items-center gap-2 hover:text-foreground">
              <Timer className="size-3.5" /> Sleep timer &amp; player settings
            </Link>
          </p>
        </>
      ) : null}
    </nav>
  );
}
