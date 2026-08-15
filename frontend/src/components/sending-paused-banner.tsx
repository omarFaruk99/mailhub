"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, PauseCircle, PlayCircle } from "lucide-react";
import { api, ApiError, type SendingStatus } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { sendingStatusKey, useSendingStatus } from "@/lib/use-sending-status";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);

/**
 * The auto-pause bar. Sits above every page because a paused brand is not a
 * per-screen fact — nothing anywhere can send, so it must be impossible to miss.
 *
 * Three states: nothing (healthy), amber (over a limit but still sending — only
 * reachable after a forced resume), red (paused, nothing goes out).
 */
export function SendingPausedBanner() {
  const { brand } = useBrand();
  const { data } = useSendingStatus();
  const qc = useQueryClient();
  const [forceOpen, setForceOpen] = useState(false);

  const resume = useMutation({
    mutationFn: (force: boolean) => api.resumeSending(brand!.id, force),
    onSuccess: () => {
      toast.success("Sending resumed");
      setForceOpen(false);
      qc.invalidateQueries({ queryKey: sendingStatusKey(brand?.id) });
    },
    onError: (e: Error) => {
      // 409 + canForce = the thresholds are still crossed. That is not an error
      // to shrug at — ask, and explain what resuming anyway would mean.
      if (e instanceof ApiError && e.status === 409 && e.body?.canForce) {
        setForceOpen(true);
        return;
      }
      toast.error("Could not resume: " + e.message);
    },
  });

  if (!data) return null;

  if (data.paused) {
    return (
      <>
        <Banner
          tone="danger"
          icon={<PauseCircle className="size-5 flex-none" />}
          title="Sending is paused"
          detail={data.pauseReason ?? "Sending was stopped for this brand."}
          stats={data}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => resume.mutate(false)}
              disabled={resume.isPending}
            >
              <PlayCircle className="size-4" />
              {resume.isPending ? "Resuming…" : "Resume sending"}
            </Button>
          }
        />
        <Dialog open={forceOpen} onOpenChange={setForceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resume anyway?</DialogTitle>
              <DialogDescription>
                The rates are still over the limit — {data.breach ?? data.pauseReason}.
                <br />
                <br />
                The window covers the last {data.windowDays} days, so recent bounces keep
                counting even after you delete the bad contacts. Resume anyway only if you
                have already cleaned the list. If the rate is still real, Amazon SES can
                suspend the whole account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForceOpen(false)}>
                Keep it paused
              </Button>
              <Button
                onClick={() => resume.mutate(true)}
                disabled={resume.isPending}
                style={{ background: "var(--destructive)", color: "white" }}
              >
                Resume anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Not paused but still over a limit: only happens right after a forced resume.
  // Keep saying so — the numbers have not improved just because someone clicked.
  if (data.breach) {
    return (
      <Banner
        tone="warn"
        icon={<AlertTriangle className="size-5 flex-none" />}
        title="Deliverability is over the limit"
        detail={`${data.breach}. Sending is still allowed because it was resumed by hand.`}
        stats={data}
      />
    );
  }

  return null;
}

function Banner({
  tone, icon, title, detail, stats, action,
}: {
  tone: "danger" | "warn";
  icon: React.ReactNode;
  title: string;
  detail: string;
  stats: SendingStatus;
  action?: React.ReactNode;
}) {
  const color = tone === "danger" ? "var(--destructive)" : "var(--warn)";
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b px-7 py-3 text-[13px]"
      style={{
        background: `color-mix(in oklch, ${color} 10%, transparent)`,
        borderBottomColor: `color-mix(in oklch, ${color} 35%, transparent)`,
        color,
      }}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-foreground/80">{detail}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
          Last {stats.windowDays} days: {stats.sent} sent · {stats.bounces} bounced (
          {pct(stats.bounceRate)}) · {stats.complaints} complaints ({pct(stats.complaintRate)})
        </div>
      </div>
      {action}
    </div>
  );
}
