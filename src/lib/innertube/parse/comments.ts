import type { Comment, CommentsPage } from "../types";
import { findAll, findByKey, isObj, text, thumbnails, type J } from "./walk";

/**
 * Comments come in two shapes:
 *  1. legacy `commentRenderer` with inline content,
 *  2. modern `commentThreadRenderer` that only carries keys - the real content
 *     lives in `frameworkUpdates.entityBatchUpdate.mutations[].payload.commentEntityPayload`.
 * We merge both, preferring the entity payload (it has the full text/author/toolbar).
 */

type EntityComment = {
  commentId: string;
  content: string;
  publishedTime?: string;
  author: { name: string; channelId?: string; avatar?: string };
  likeCountText?: string;
  replyCount?: number;
  isCreator?: boolean;
};

function collectEntityComments(data: J): EntityComment[] {
  const out: EntityComment[] = [];
  const mutations: J[] = data.frameworkUpdates?.entityBatchUpdate?.mutations ?? [];
  for (const mutation of mutations) {
    const payload = mutation?.payload?.commentEntityPayload;
    if (!isObj(payload)) continue;
    const props = payload.properties ?? {};
    const commentId = String(props.commentId ?? "");
    const content = props.content?.content ?? text(props.content);
    if (!commentId || typeof content !== "string" || !content) continue;
    const author = payload.author ?? {};
    out.push({
      commentId,
      content,
      publishedTime: props.publishedTime,
      author: {
        name: String(author.displayName ?? "").replace(/^@/, ""),
        channelId: author.channelId,
        avatar: author.avatarThumbnailUrl,
      },
      likeCountText: payload.toolbar?.likeCountLiked ?? payload.toolbar?.likeCountNotliked,
      replyCount: Number(payload.toolbar?.replyCount ?? 0) || undefined,
      isCreator: Boolean(author.isCreator),
    });
  }
  return out;
}

function legacyComment(renderer: J): Comment | undefined {
  const commentId = String(renderer.commentId ?? "");
  const content = text(renderer.contentText);
  if (!commentId || !content) return undefined;
  return {
    id: commentId,
    author: text(renderer.authorText) ?? "Unknown",
    authorAvatar: thumbnails(renderer.authorThumbnail),
    authorChannelId: renderer.authorEndpoint?.browseEndpoint?.browseId as string | undefined,
    content,
    publishedText: text(renderer.publishedTimeText),
    likeCountText: text(renderer.voteCount),
    replyCount: Number(renderer.replyCount ?? 0) || undefined,
    isPinned: Boolean(renderer.pinnedCommentBadge),
    isOwner: Boolean(renderer.authorIsChannelOwner),
    isHearted: Boolean(renderer.actionButtons?.commentActionButtonsRenderer?.creatorHeart),
  };
}

type SectionPage = { threads: J[]; nextToken?: string; header?: J };

/** Walk the known continuation envelopes to find threads, the "more" token and the header. */
function readSection(data: J): SectionPage {
  const threads: J[] = [];
  let nextToken: string | undefined;
  let header: J | undefined;

  const envelopes: J[] = [
    ...(Array.isArray(data.onResponseReceivedEndpoints) ? data.onResponseReceivedEndpoints : []),
    ...(Array.isArray(data.onResponseReceivedActions) ? data.onResponseReceivedActions : []),
  ];

  for (const envelope of envelopes) {
    const command = envelope?.reloadContinuationItemsCommand ?? envelope?.appendContinuationItemsCommand;
    if (!isObj(command)) continue;
    const items: J[] = Array.isArray(command.continuationItems)
      ? command.continuationItems
      : Array.isArray(command.items)
        ? command.items
        : [];
    for (const item of items) {
      if (isObj(item.commentThreadRenderer)) threads.push(item.commentThreadRenderer as J);
      else if (isObj(item.commentsHeaderRenderer)) header = item.commentsHeaderRenderer as J;
      else if (isObj(item.continuationItemRenderer)) {
        const token = item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
        if (typeof token === "string") nextToken = token;
      }
    }
  }

  // Older shape: continuationContents.commentSectionRenderer.contents
  const section = data.continuationContents?.commentSectionRenderer;
  if (isObj(section)) {
    const items: J[] = Array.isArray(section.contents) ? section.contents : [];
    for (const item of items) {
      if (isObj(item.commentThreadRenderer)) threads.push(item.commentThreadRenderer as J);
      else if (isObj(item.commentRenderer)) threads.push(item as J);
      else if (isObj(item.continuationItemRenderer)) {
        const token = item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
        if (typeof token === "string") nextToken = token;
      }
    }
    const cont = section.continuations?.[0]?.nextContinuationData?.continuation;
    if (!nextToken && typeof cont === "string") nextToken = cont;
  }

  // First page (fresh watch response): threads live anywhere in the tree.
  if (!threads.length) {
    for (const thread of findAll(data, "commentThreadRenderer")) threads.push(thread);
  }
  if (!threads.length) {
    for (const renderer of findAll(data, "commentRenderer")) threads.push({ commentRenderer: renderer });
  }

  if (!nextToken) {
    const cont = findByKey(data, "continuationItemRenderer");
    const token = cont?.continuationEndpoint?.continuationCommand?.token;
    if (typeof token === "string") nextToken = token;
  }

  return { threads, nextToken, header };
}

export function parseComments(data: J): CommentsPage {
  const { threads, nextToken, header } = readSection(data);
  const entities = new Map<string, EntityComment>();
  for (const entity of collectEntityComments(data)) entities.set(entity.commentId, entity);

  const comments: Comment[] = [];
  const seen = new Set<string>();

  for (const thread of threads) {
    const viewModel = thread.commentViewModel?.commentViewModel ?? thread.commentViewModel;
    const commentId = String(viewModel?.commentId ?? "");
    const entity = commentId ? entities.get(commentId) : undefined;

    if (entity) {
      seen.add(entity.commentId);
      comments.push({
        id: entity.commentId,
        author: entity.author.name,
        authorChannelId: entity.author.channelId,
        authorAvatar: entity.author.avatar ? [{ url: entity.author.avatar }] : undefined,
        content: entity.content,
        publishedText: entity.publishedTime,
        likeCountText: entity.likeCountText,
        replyCount: entity.replyCount,
        isPinned: Boolean(text(viewModel?.pinnedText)),
        isOwner: Boolean(entity.isCreator ?? viewModel?.authorIsChannelOwner),
        isHearted: Boolean(viewModel?.toolbar?.creatorHeart),
      });
      continue;
    }

    const legacy = thread.commentRenderer ?? (thread as J);
    const parsed = legacyComment(legacy);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      comments.push(parsed);
    }
  }

  // Threads that had no matching renderer key: use entity order as a safety net.
  if (!comments.length && entities.size) {
    for (const entity of entities.values()) {
      comments.push({
        id: entity.commentId,
        author: entity.author.name,
        authorChannelId: entity.author.channelId,
        authorAvatar: entity.author.avatar ? [{ url: entity.author.avatar }] : undefined,
        content: entity.content,
        publishedText: entity.publishedTime,
        likeCountText: entity.likeCountText,
        replyCount: entity.replyCount,
        isOwner: Boolean(entity.isCreator),
      });
    }
  }

  const countText = text(header?.countText);
  const disabled = Boolean(header?.commentsDisabled) || countText === "Comments are turned off";

  return {
    comments,
    disabled,
    continuation: nextToken,
  };
}
