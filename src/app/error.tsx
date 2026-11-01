"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The request failed. YouTube may be rate-limiting this network, or the page hit an
        unexpected response.
      </p>
      <button type="button" onClick={reset} className="mt-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">
        Try again
      </button>
    </div>
  );
}
