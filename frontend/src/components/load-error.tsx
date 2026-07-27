import { AlertTriangle } from "lucide-react";

// Shown instead of the numbers when an API call fails, so an outage can never
// be mistaken for "no data yet" — an empty state and a broken backend must
// never look the same.
export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="size-4" />
        Could not load the numbers
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Check that the backend is running on port 4000.
      </p>
      {message && <p className="mt-1 font-mono text-xs text-muted-foreground">{message}</p>}
      <button
        onClick={onRetry}
        className="mt-3 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}
