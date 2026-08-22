"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Send, LayoutTemplate, Search, Moon, ChevronsUpDown, BarChart3, LogOut } from "lucide-react";
import { useBrand } from "@/lib/use-brand";
import { useAuthUser, useLogout } from "@/lib/use-auth";
import { SendingPausedBanner } from "@/components/sending-paused-banner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { brand } = useBrand();
  // AuthGate (the parent layout) already confirmed the session before
  // rendering AppShell, so this "me" query is just cache it already filled.
  const { data: user } = useAuthUser(true);
  const logout = useLogout();
  const initials = (user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="grid min-h-screen grid-cols-[256px_1fr]">
      {/* Sidebar */}
      <aside className="flex flex-col gap-1 border-r bg-sidebar px-3 py-3">
        {/* Workspace switcher */}
        <button className="flex items-center gap-2.5 rounded-xl border border-transparent p-2 text-left transition-colors hover:bg-accent">
          <span
            className="grid size-8 flex-none place-items-center rounded-lg text-sm font-bold text-white"
            style={{ background: "var(--sidebar-primary)" }}
          >
            M
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold">MailHub</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">{brand?.name ?? "…"}</span>
          </span>
          <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
        </button>

        {/* Search */}
        <div className="mt-1 mb-1 flex items-center gap-2 rounded-lg border bg-secondary/60 px-2.5 py-2 text-[13px] text-muted-foreground">
          <Search className="size-3.5" />
          Search
          <kbd className="ml-auto rounded border bg-background px-1.5 text-[10px]">⌘K</kbd>
        </div>

        <nav className="flex flex-col gap-0.5">
          {nav.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "border bg-background font-semibold text-foreground shadow-xs [&_svg]:text-[color:var(--sidebar-primary)]"
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer — same "workspace switcher" shape as the button up top, so the
            two ends of the sidebar read as one visual language. */}
        <div className="mt-auto border-t pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2 text-left outline-none transition-colors hover:bg-accent data-popup-open:bg-accent">
              <span
                className="grid size-8 flex-none place-items-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: "var(--sidebar-primary)" }}
              >
                {initials}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12.5px] font-semibold">{user?.email ?? "…"}</span>
                <span className="block truncate text-[11px] text-muted-foreground capitalize">{user?.role ?? ""}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-3.5 flex-none text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-52">
              <DropdownMenuItem onClick={() => document.documentElement.classList.toggle("dark")}>
                <Moon className="size-4" /> Toggle theme
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => logout()}>
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main. The auto-pause bar is above the page content, not inside a page:
          when sending is paused NOTHING can go out, so it must be visible from
          wherever the user happens to be. */}
      <div className="flex min-w-0 flex-col">
        <SendingPausedBanner />
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b px-7 py-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}
