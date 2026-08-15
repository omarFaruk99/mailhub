"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A dropdown you can type in to narrow down. For lists too long to scroll — the
 * country picker has around 200 entries, where a plain select is unusable.
 *
 * Deliberately not a free-text input with suggestions: the whole point is that
 * every contact ends up with the SAME spelling, because send filters match
 * exactly and "USA" would never match "United States".
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No match.",
  clearLabel = "Any",
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Label for the "no value" row. Pass null to make the field required. */
  clearLabel?: string | null;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  // Starts-with first, then contains: typing "un" should offer "United Kingdom"
  // before "Brunei Darussalam", which a plain substring filter gets wrong.
  const matches = options
    .filter((o) => !q || o.toLowerCase().includes(q))
    .sort((a, b) => {
      if (!q) return 0;
      const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });

  // Closing resets the search, so reopening never shows a stale filter. Done here
  // rather than in an effect: setting state from an effect on every close is both
  // an extra render and an eslint rule this project keeps clean.
  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  // Close on an outside click or Escape, so the panel can never be left stranded.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase + stopPropagation: this control is usually inside a dialog,
      // which closes on Escape too. Without this, dismissing the dropdown threw
      // away every unsaved edit in the dialog behind it.
      e.stopPropagation();
      close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Opening should land the cursor in the search box — that is the whole reason
  // this control exists instead of a plain select.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted row in view while arrowing through 200 countries.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  function choose(v: string) {
    onChange(v);
    close();
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active] !== undefined) choose(matches[active]); }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        )}
      >
        <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>
        {value && !disabled && (
          // A span, not a button: a button inside a button is invalid HTML and
          // browsers drop one of the click targets.
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </span>
        )}
        <ChevronDown className="size-4 flex-none text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <Search className="size-3.5 flex-none text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {clearLabel !== null && !q && (
              <Row selected={!value} active={false} onSelect={() => choose("")}>
                <span className="text-muted-foreground">{clearLabel}</span>
              </Row>
            )}
            {matches.length === 0 ? (
              <div className="px-2.5 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              matches.map((o, i) => (
                <Row key={o} selected={o === value} active={i === active} onSelect={() => choose(o)}>
                  {o}
                </Row>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  selected, active, onSelect, children,
}: { selected: boolean; active: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-active={active}
      onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
        active && "bg-accent text-accent-foreground"
      )}
    >
      <Check className={cn("size-3.5 flex-none", selected ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{children}</span>
    </div>
  );
}
