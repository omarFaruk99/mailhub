"use client";
// Shares one "who am I" query (react-query dedupes by key) between AuthGate
// (which decides whether to redirect to /login) and AppShell (which just
// wants the email to display + a logout button).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { clearToken } from "./auth";

export const AUTH_QUERY_KEY = ["auth-me"];

export function useAuthUser(enabled: boolean) {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => api.me().then((r) => r.user),
    enabled,
    // A real "not logged in" (401) already triggers a redirect inside
    // req() — retrying it would be pointless (and the page navigates away
    // anyway). A network hiccup or a backend that's mid-restart is
    // different: it should recover on its own within a couple of tries.
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 2;
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return async () => {
    await api.logout().catch(() => {});
    clearToken();
    qc.removeQueries({ queryKey: AUTH_QUERY_KEY });
    router.replace("/login");
  };
}
