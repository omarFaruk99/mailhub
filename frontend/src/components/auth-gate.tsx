"use client";
// Client-side gate for every page under app/(app) — this is the UX
// convenience (send someone straight to /login when there's no token at
// all), NOT the real security boundary. A session that turns out to be
// invalid (401) is handled in ONE place, api.ts's req() — it clears the
// token and redirects. This component must not duplicate that: reacting
// to every query error here (network down, backend mid-restart) would
// wrongly log someone out for a problem that isn't about their session.
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useAuthUser } from "@/lib/use-auth";

const noopSubscribe = () => () => {};

// True only once mounted on the client — localStorage doesn't exist during
// server rendering, so reading it straight in render would make the first
// client render disagree with the server-rendered HTML. useSyncExternalStore
// (unlike an effect that calls setState) is the hydration-safe way to get
// that "client, past the first paint" flip.
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const mounted = useMounted();

  const token = mounted ? getToken() : null;
  const { data: user, isError, refetch } = useAuthUser(mounted && !!token);

  useEffect(() => {
    if (mounted && !token) router.replace("/login");
  }, [mounted, token, router]);

  // useAuthUser's own retries (use-auth.ts) already gave up by the time this
  // is true — a real 401 would have redirected via api.ts's req() already,
  // so what's left here is "the backend is unreachable right now" (mid
  // restart, network blip). Keep nudging it instead of sitting blank forever
  // with no way out but a manual refresh.
  useEffect(() => {
    if (!isError) return;
    const t = setInterval(() => refetch(), 5000);
    return () => clearInterval(t);
  }, [isError, refetch]);

  if (!mounted || !token) return null;
  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        {isError ? "Can't reach the server. Retrying…" : "Loading…"}
      </div>
    );
  }
  return <>{children}</>;
}
