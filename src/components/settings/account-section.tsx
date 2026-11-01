"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, LogOut, Shield, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Account =
  | { mode: "anonymous" }
  | { mode: "cookies" }
  | {
      mode: "oauth";
      profile: { name?: string; avatar?: string; channelId?: string } | null;
      expiresAt: number;
    };

type DeviceFlow = {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  intervalSeconds: number;
};

/**
 * Account panel: Google device-flow sign-in first, cookies as the advanced path.
 *
 * The user types the code on google.com/device with their own Google account.
 * This app never asks for, sees or stores a password - only the token Google
 * hands back after the user approves the device.
 */
export function AccountSection() {
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<DeviceFlow | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [cookieInput, setCookieInput] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const account = useQuery<Account>({
    queryKey: ["account"],
    queryFn: async () => {
      const res = await fetch("/api/auth/account");
      if (!res.ok) return { mode: "anonymous" as const };
      return (await res.json()) as Account;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!flow) return;
    const update = () => setSecondsLeft(Math.max(0, Math.round((flow.expiresAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [flow]);

  /* Poll Google until the user approves (or the code dies). */
  useEffect(() => {
    if (!flow) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/auth/device/poll", { method: "POST" });
        const body = (await res.json()) as { status?: string; message?: string };
        if (cancelled) return;
        if (body.status === "ok") {
          setFlow(null);
          setBusy(false);
          setStatus("Signed in. Personalised feeds are on.");
          await queryClient.invalidateQueries();
          return;
        }
        if (body.status === "expired" || body.status === "denied") {
          setFlow(null);
          setBusy(false);
          setStatus(body.message ?? "The sign-in was not completed. Try again.");
        }
      } catch {
        /* transient network hiccup - the next tick retries */
      }
    };
    const timer = setInterval(poll, Math.max(5, flow.intervalSeconds) * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [flow, queryClient]);

  const startSignIn = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/device/start", { method: "POST" });
      if (!res.ok) throw new Error("start_failed");
      const data = (await res.json()) as DeviceFlow;
      setFlow(data);
      window.open(data.verificationUrl, "_blank", "noopener,noreferrer");
    } catch {
      setStatus("Could not reach Google. Check your connection and try again.");
      setBusy(false);
    }
  };

  const cancel = async () => {
    await fetch("/api/auth/device/poll", { method: "DELETE" });
    setFlow(null);
    setBusy(false);
    setStatus(null);
  };

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/account", { method: "DELETE" });
    await queryClient.invalidateQueries();
    setStatus("Signed out. Anonymous mode active.");
    setBusy(false);
  };

  const connectCookies = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: cookieInput }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) setStatus(body.message ?? body.error ?? "Could not connect");
      else {
        setCookieInput("");
        setStatus("Cookies saved.");
        await queryClient.invalidateQueries();
      }
    } catch {
      setStatus("Network error while saving cookies.");
    } finally {
      setBusy(false);
    }
  };

  const mode = account.data?.mode ?? "anonymous";
  const oauth = account.data?.mode === "oauth" ? account.data : null;

  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="text-base font-medium">YouTube account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in to get your own home feed, subscriptions, playlists and history. Sign-in happens on
        Google&apos;s page, so your password never touches this app.
      </p>

      <div className="mt-4 space-y-3">
        {oauth ? (
          <div className="flex items-center gap-3">
            <Avatar src={oauth.profile?.avatar} name={oauth.profile?.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{oauth.profile?.name ?? "Signed in"}</p>
              <p className="flex items-center gap-1 text-xs text-emerald-500">
                <Check className="size-3" /> Signed in with Google
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} disabled={busy}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        ) : null}

        {mode === "cookies" ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/60 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-muted-foreground" /> Signed in with cookies
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} disabled={busy}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        ) : null}

        {mode === "anonymous" && !flow ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={startSignIn} disabled={busy}>
              <UserRound className="size-4" /> Sign in with Google
            </Button>
            <Button variant="ghost" onClick={() => setAdvanced((value) => !value)}>
              Advanced: paste cookies
            </Button>
          </div>
        ) : null}

        {flow ? (
          <div className="rounded-lg border border-border bg-secondary/40 p-4">
            <p className="text-sm">1. Open Google&apos;s device page and sign in with your own account.</p>
            <div className="my-3 flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-background px-3 py-2 text-lg font-semibold tracking-widest">
                {flow.userCode}
              </code>
              <a
                href={flow.verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-500 underline-offset-4 hover:underline"
              >
                google.com/device <ExternalLink className="size-3" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              2. Approve access. This page finishes on its own.
              {secondsLeft
                ? ` Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}.`
                : null}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const res = await fetch("/api/auth/device/poll", { method: "POST" });
                  const body = (await res.json()) as { status?: string };
                  if (body.status === "ok") {
                    setFlow(null);
                    setBusy(false);
                    setStatus("Signed in.");
                    await queryClient.invalidateQueries();
                  }
                }}
              >
                I approved it
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {advanced && mode === "anonymous" ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">
              On youtube.com open DevTools → Network, then copy the <code>Cookie</code> request header.
              Use your own account only.
            </p>
            <Input
              value={cookieInput}
              onChange={(event) => setCookieInput(event.target.value)}
              placeholder="SID=...; HSID=...; SSID=...; SAPISID=..."
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={connectCookies} disabled={busy || cookieInput.trim().length < 10}>
              Connect cookies
            </Button>
          </div>
        ) : null}

        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      </div>
    </section>
  );
}
