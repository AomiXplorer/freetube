import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page does not exist in Freetube.</p>
      <Link href="/" className="mt-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">
        Go home
      </Link>
    </div>
  );
}
