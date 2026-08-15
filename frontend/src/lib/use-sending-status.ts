"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";

/** Query key for the brand's auto-pause state — exported so mutations can invalidate it. */
export const sendingStatusKey = (brandId?: string) => ["sending-status", brandId];

/**
 * The brand's auto-pause state, shared by the banner and the send page.
 *
 * Polled, because the change usually comes from OUTSIDE this browser: a bounce
 * webhook, or the send worker stopping mid-run. Without polling a user could sit
 * on the send page while sending is paused and never see it.
 */
export function useSendingStatus() {
  const { brand } = useBrand();
  const brandId = brand?.id;
  return useQuery({
    queryKey: sendingStatusKey(brandId),
    queryFn: () => api.sendingStatus(brandId!),
    enabled: !!brandId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
