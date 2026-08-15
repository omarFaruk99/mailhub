import { cn } from "@/lib/utils";

/**
 * An inline notice strip: an icon, a line of text, and a tinted background.
 *
 * The three tones map to the app's existing state colours, so a warning here looks
 * like a warning everywhere else. Colours are mixed from the tokens rather than
 * hardcoded, which keeps them correct in both light and dark themes.
 */
const TONES = {
  info: "var(--sidebar-primary)",
  warn: "var(--warn)",
  danger: "var(--destructive)",
} as const;

export function Callout({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const color = TONES[tone];
  return (
    <div
      role="status"
      className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px]", className)}
      style={{
        background: `color-mix(in oklch, ${color} 10%, transparent)`,
        borderColor: `color-mix(in oklch, ${color} 35%, transparent)`,
      }}
    >
      {icon && (
        // The icon carries the tone's colour; the text stays foreground so it keeps
        // its normal contrast instead of being washed out by a tinted colour.
        <span className="mt-0.5 flex-none" style={{ color }}>
          {icon}
        </span>
      )}
      <div className="min-w-0 text-foreground/85">{children}</div>
    </div>
  );
}
