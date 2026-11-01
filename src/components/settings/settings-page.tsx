"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Smartphone, Sun, Trash2 } from "lucide-react";
import { useTheme } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { usePlayerStore } from "@/store/player";
import { clearHistory, clearSearches } from "@/db";
import { cn } from "@/lib/utils/cn";
import { AccountSection } from "./account-section";
import { FeedCheck } from "./feed-check";

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
    audioOnly,
    setAudioOnly,
  } = usePlayerStore();

  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

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

        <Row label="Background audio" hint="Keep sound alive when the tab is hidden or the screen is off">
          <Switch checked={backgroundAudio} onCheckedChange={setBackgroundAudio} label="Background audio" />
        </Row>

        <Row label="Listen with audio only" hint="Plays the audio track instead of the video (saves battery and data)">
          <Switch checked={audioOnly} onCheckedChange={setAudioOnly} label="Audio only" />
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

      <AccountSection />
      <FeedCheck />

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
