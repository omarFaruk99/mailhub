import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Neutral, muted pill for low-emphasis categorical values (e.g. contact Type).
// Deliberately quiet: status uses the coloured StatusBadge, and everything else
// stays plain text — so a table has only ONE loud element (status).
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize",
        className
      )}
    >
      {children}
    </span>
  );
}
