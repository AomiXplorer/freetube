import type { CategoryChip, HomeFeed } from "../types";
import { collectVideos, findAll, findByKey, isObj, text, type J } from "./walk";

export function parseChips(data: J): CategoryChip[] {
  const bar = findByKey(data, "feedFilterChipBarRenderer");
  const chips: CategoryChip[] = [];
  if (bar) {
    for (const chip of findAll(bar, "chipCloudChipRenderer")) {
      const title = text(chip.text) ?? text(chip.title);
      if (!title) continue;
      chips.push({
        title,
        params:
          (chip.navigationEndpoint?.payload?.params as string | undefined) ??
          (chip.navigationEndpoint?.browseEndpoint?.params as string | undefined),
        browseId: chip.navigationEndpoint?.browseEndpoint?.browseId as string | undefined,
        selected: Boolean(chip.isSelected),
      });
    }
  }
  return chips.filter((chip, index, list) => list.findIndex((c) => c.title === chip.title) === index);
}

export function parseHome(data: J): HomeFeed {
  const sections: { title?: string; items: ReturnType<typeof collectVideos> }[] = [];

  // Preferred: explicit shelves (channel home, music-ish layouts).
  for (const shelf of findAll(data, "shelfRenderer")) {
    const title = text(shelf.title);
    const items = collectVideos(shelf);
    if (items.length >= 3) sections.push({ title, items });
  }

  // Discover layout: individual richItemRenderer blocks.
  const richItems = findAll(data, "richItemRenderer");
  if (richItems.length && !sections.length) {
    const items = collectVideos({ richItems });
    if (items.length) sections.push({ items });
  }

  if (!sections.length) {
    const items = collectVideos(data);
    if (items.length) sections.push({ items });
  }

  // De-duplicate videos across sections so the same clip never repeats.
  const seen = new Set<string>();
  const deduped = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((video) => {
        if (seen.has(video.id)) return false;
        seen.add(video.id);
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const continuation = (() => {
    const cont = findAll(data, "continuationItemRenderer")[0];
    const token = cont?.continuationEndpoint?.continuationCommand?.token;
    return typeof token === "string" ? token : undefined;
  })();

  return { chips: parseChips(data), sections: deduped, continuation };
}

/** True when the feed is the "start watching to build a feed" nudge. */
export function isEmptyFeed(data: J): boolean {
  return Boolean(findByKey(data, "feedNudgeRenderer")) || collectVideos(data).length === 0;
}

/** Group continuation items (`appendContinuationItemsAction`) into videos. */
export function parseContinuationVideos(data: J): { videos: ReturnType<typeof collectVideos>; continuation?: string } {
  const actions = [
    ...(data.onResponseReceivedActions ?? []),
    ...(data.onResponseReceivedEndpoints ?? []),
    ...(data.actions ?? []),
  ];
  const videos = collectVideos(actions.length ? actions : data);
  const cont = findAll(actions.length ? actions : data, "continuationItemRenderer")[0];
  const token = cont?.continuationEndpoint?.continuationCommand?.token;
  return { videos, continuation: typeof token === "string" ? token : undefined };
}

export function isContinuationPayload(data: J): boolean {
  return Boolean(
    isObj(data.continuationContents) ||
      data.onResponseReceivedActions ||
      data.onResponseReceivedEndpoints ||
      data.actions,
  );
}
