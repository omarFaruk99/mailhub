import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  subscribed: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  sent: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  unsubscribed: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  sending: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  bounced: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  complained: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        map[status] || "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}
