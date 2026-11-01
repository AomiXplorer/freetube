"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { fetchHome, type HomeResponse } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

/**
 * Answers the only question that matters when the feed looks wrong: which feed
 * did YouTube actually return for this session, and why?
 */
export function FeedCheck() {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; feed: HomeResponse }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const run = async () => {
    setState({ kind: "loading" });
    try {
      const feed = await fetchHome(undefined, undefined, { refresh: true });
      setState({ kind: "done", feed });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  };

  const count =
    state.kind === "done"
      ? state.feed.sections.reduce((sum, section) => sum + section.items.length, 0)
      : 0;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Feed check</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fetches the home feed once, bypassing every cache, and reports what YouTube returned for
            this session.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={state.kind === "loading"}>
          {state.kind === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Check
        </Button>
      </div>

      {state.kind === "done" ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Session</dt>
          <dd>{state.feed.signedIn ? "signed in" : "anonymous"}</dd>
          <dt className="text-muted-foreground">Feed source</dt>
          <dd>
            {state.feed.source === "personal" ? "your account feed" : "popular fallback"}
          </dd>
          <dt className="text-muted-foreground">Client</dt>
          <dd>{state.feed.client ?? "n/a"}</dd>
          <dt className="text-muted-foreground">Videos</dt>
          <dd>{count}</dd>
          {state.feed.source === "popular" ? (
            <dd className="col-span-2 mt-1 text-xs text-muted-foreground">
              YouTube did not return a personal feed for this session, so a public one is shown
              instead. Sign out and sign in again to refresh the account link.
            </dd>
          ) : null}
        </dl>
      ) : null}

      {state.kind === "error" ? (
        <p className="mt-3 text-sm text-destructive">{state.message}</p>
      ) : null}
    </div>
  );
}
