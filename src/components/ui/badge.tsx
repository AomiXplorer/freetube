import { cn } from "@/lib/utils/cn";

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "live" | "muted" | "outline";
}) {
  const styles = {
    default: "bg-secondary text-secondary-foreground",
    live: "bg-red-600 text-white",
    muted: "bg-muted text-muted-foreground",
    outline: "border border-border text-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
