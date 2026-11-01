"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ThumbsUp, ChevronDown } from "lucide-react";
import type { Comment, CommentsPage } from "@/lib/innertube/types";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { bestThumb } from "@/lib/utils/format";

async function fetchComments(continuation?: string): Promise<CommentsPage> {
  const res = await fetch(`/api/comments?continuation=${encodeURIComponent(continuation ?? "")}`);
  if (!res.ok) throw new Error("comments unavailable");
  return (await res.json()) as CommentsPage;
}

export function Comments({ continuation }: { continuation?: string }) {
  const [pages, setPages] = useState<Comment[]>([]);
  const [token, setToken] = useState<string | undefined>(continuation);
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["comments", continuation],
    queryFn: () => fetchComments(continuation),
    enabled: Boolean(continuation),
    staleTime: 120_000,
  });

  const all = [...(data?.comments ?? []), ...pages];
  const nextToken = pages.length ? token : data?.continuation;

  const loadMore = async () => {
    if (!nextToken) return;
    const page = await fetchComments(nextToken);
    setPages((current) => [...current, ...page.comments]);
    setToken(page.continuation);
    setLoaded(true);
  };

  if (!continuation) {
    return (
      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="text-base font-medium">Comments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Comments are unavailable for this video (disabled by the uploader or blocked for
          signed-out requests).
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="mb-4 text-base font-medium">
        Comments {all.length ? <span className="text-muted-foreground">· {all.length}+</span> : null}
      </h2>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Could not load comments. Try again later.</p>
      ) : (
        <ul className="space-y-5">
          {all.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar src={bestThumb(comment.authorAvatar)} name={comment.author} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium">@{comment.author.replace(/\s+/g, "").toLowerCase()}</span>
                  {comment.publishedText ? (
                    <span className="text-muted-foreground">{comment.publishedText}</span>
                  ) : null}
                  {comment.isPinned ? <span className="text-xs text-muted-foreground">· Pinned</span> : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{comment.content}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="size-3.5" /> {comment.likeCountText ?? "0"}
                  </span>
                  {comment.replyCount ? <span>{comment.replyCount} replies</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextToken ? (
        <Button variant="outline" className="mt-5" onClick={loadMore} disabled={loaded && !token}>
          <ChevronDown className="size-4" /> Show more comments
        </Button>
      ) : null}
    </section>
  );
}
