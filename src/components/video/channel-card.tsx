"use client";

import Link from "next/link";
import type { ChannelRef } from "@/lib/innertube/types";
import { bestThumb } from "@/lib/utils/format";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/db/hooks";

export function ChannelCard({ channel }: { channel: ChannelRef }) {
  const { subscribed, toggle } = useSubscription(channel.id);
  if (!channel.id) return null;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border p-4">
      <Link href={`/channel/${channel.id}`} className="shrink-0">
        <Avatar src={bestThumb(channel.avatar)} name={channel.name} size={72} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/channel/${channel.id}`} className="block truncate font-medium hover:underline">
          {channel.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[channel.handle, channel.subscribers].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Button
        size="sm"
        variant={subscribed ? "subscribed" : "subscribe"}
        onClick={() =>
          toggle({ channelId: channel.id as string, name: channel.name, avatar: bestThumb(channel.avatar) })
        }
      >
        {subscribed ? "Subscribed" : "Subscribe"}
      </Button>
    </div>
  );
}
