"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Moon, Shield, Smartphone, Sun, Trash2 } from "lucide-react";
import { useTheme } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { usePlayerStore } from "@/store/player";
import { clearHistory, clearSearches } from "@/db";
import { cn } from "@/lib/utils/cn";

type SessionStatus = { status: "anonymous" | "connected"; cookies?: number; hasAuth?: boolean };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="text-base font-medium">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const {
    quality,
    setQuality,
    rate,
    setRate,
    backgroundAudio,
    setBackgroundAudio,
    sponsorBlock,
    setSponsorBlock,
    sleepTimerEndsAt,
    startSleepTimer,
    clearSleepTimer,
  } = usePlayerStore();

  const [cookieInput, setCookieInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const session = useQuery<SessionStatus>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) return { status: "anonymous" as const };
      return (await res.json()) as SessionStatus;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: cookieInput }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setMessage(body.message ?? body.error ?? "Could not connect");
      } else {
        setCookieInput("");
        setMessage("Connected. Personalised feeds are now available.");
        await queryClient.invalidateQueries();
      }
    } catch {
      setMessage("Network error while saving cookies.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/auth/session", { method: "DELETE" });
    await queryClient.invalidateQueries();
    setMessage("Signed out. Anonymous mode active.");
    setBusy(false);
  };

  const sleepMinutesLeft = sleepTimerEndsAt
    ? Math.max(0, Math.round((sleepTimerEndsAt - Date.now()) / 60000))
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16">
      <h1 className="text-xl font-bold">Settings</h1>

      <Section title="Appearance" description="Freetube follows your system theme unless you override it.">
        <div className="flex gap-2">
          {[
            { value: "system" as const, label: "System", icon: Smartphone },
            { value: "light" as const, label: "Light", icon: Sun },
            { value: "dark" as const, label: "Dark", icon: Moon },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl border p-3 text-xs",
                theme === option.value ? "border-foreground bg-accent" : "border-border hover:bg-accent",
              )}
            >
              <option.icon className="size-5" />
              {option.label}
              {theme === option.value ? <Check className="size-3" /> : null}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Playback">
        <Row label="Default quality" hint="Auto adapts to your bandwidth">
          <select
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="auto">Auto</option>
            {[2160, 1440, 1080, 720, 480, 360, 240].map((height) => (
              <option key={height} value={height}>
                {height}p
              </option>
            ))}
          </select>
        </Row>

        <Row label="Playback speed" hint={`${rate}x`}>
          <div className="w-40">
            <Slider
              min={0.25}
              max={2}
              step={0.25}
              value={rate}
              onValueChange={(value) => setRate(value)}
              aria-label="Playback speed"
            />
          </div>
        </Row>

        <Row label="Background audio" hint="Keep audio playing when the app is in the background">
          <Switch checked={backgroundAudio} onCheckedChange={setBackgroundAudio} label="Background audio" />
        </Row>

        <Row label="Skip sponsor segments" hint="Uses the public SponsorBlock API">
          <Switch checked={sponsorBlock} onCheckedChange={setSponsorBlock} label="SponsorBlock" />
        </Row>

        <Row
          label="Sleep timer"
          hint={sleepTimerEndsAt ? `${sleepMinutesLeft} min left` : "Pause playback automatically"}
        >
          <div className="flex gap-2">
            {[15, 30, 60].map((minutes) => (
              <Button key={minutes} size="sm" variant="secondary" onClick={() => startSleepTimer(minutes)}>
                {minutes}m
              </Button>
            ))}
            {sleepTimerEndsAt ? (
              <Button size="sm" variant="ghost" onClick={clearSleepTimer}>
                Off
              </Button>
            ) : null}
          </div>
        </Row>
      </Section>

      <Section
        title="YouTube account (optional)"
        description="Paste your own youtube.com cookies to unlock personalised Home, Subscriptions, History, playlists and age-restricted videos. Cookies are encrypted with AES-256-GCM and kept in an httpOnly cookie on your device. They are never logged or shared."
      >
        <div className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-muted-foreground" />
          Status:{" "}
          <span className={session.data?.status === "connected" ? "text-emerald-500" : "text-muted-foreground"}>
            {session.data?.status === "connected"
              ? `connected (${session.data.cookies ?? 0} cookies)`
              : "anonymous"}
          </span>
        </div>

        {session.data?.status === "connected" ? (
          <Button variant="outline" onClick={disconnect} disabled={busy}>
            <LogOut className="size-4" /> Disconnect
          </Button>
        ) : (
          <>
            <Input
              value={cookieInput}
              onChange={(event) => setCookieInput(event.target.value)}
              placeholder="SID=...; HSID=...; SSID=...; SAPISID=..."
              className="font-mono text-xs"
            />
            <Button onClick={connect} disabled={busy || cookieInput.trim().length < 10}>
              {busy ? "Saving…" : "Connect cookies"}
            </Button>
            <p className="text-xs text-muted-foreground">
              On youtube.com open DevTools → Network → copy the <code>Cookie</code> request header.
              Do this on your own account only.
            </p>
          </>
        )}
        {message ? <p className="text-xs text-foreground">{message}</p> : null}
      </Section>

      <Section
        title="Local data"
        description="History, playlists and subscriptions live only in this browser (IndexedDB)."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await clearHistory();
              setMessage("Watch history cleared.");
            }}
          >
            <Trash2 className="size-4" /> Clear watch history
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await clearSearches();
              setMessage("Search history cleared.");
            }}
          >
            <Trash2 className="size-4" /> Clear search history
          </Button>
        </div>
      </Section>

      <Section title="Install as an app" description="Freetube is a PWA: no store, no account.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Android (Chrome):</strong> menu → “Add to Home screen” → Install.
          </li>
          <li>
            <strong>iOS (Safari):</strong> Share → “Add to Home Screen”.
          </li>
          <li>
            <strong>Windows (Edge/Chrome):</strong> install icon in the address bar, or menu → “Install Freetube”.
          </li>
        </ul>
      </Section>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        Freetube · unofficial client · video content is served by YouTube
      </p>
    </div>
  );
}
