import { cn } from "@/lib/utils";

// A small pill-shaped toggle button, used for filter chips and audience
// selectors. `active` gives it the solid (selected) look.
export function Chip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-transparent bg-foreground text-background"
          : "border-input bg-transparent text-muted-foreground hover:bg-muted",
        className
      )}
    >
      {children}
    </button>
  );
}
