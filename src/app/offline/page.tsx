import Link from "next/link";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">You are offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Freetube cached the app shell so it still opens without a connection. Your history and
        playlists are available, but new videos need the network.
      </p>
      <Link href="/" className="mt-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">
        Try again
      </Link>
    </div>
  );
}
