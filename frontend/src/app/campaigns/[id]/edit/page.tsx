"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Callout } from "@/components/callout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Lock } from "lucide-react";

const CATEGORIES = ["Product updates", "Marketing/Offers", "Tips & Onboarding", "Transactional"];

export default function EditCampaignPage() {
  const { id: rawId } = useParams();
  const id = String(rawId);
  const { brand } = useBrand();
  const brandId = brand?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const campaigns = useQuery({
    queryKey: ["campaigns", brandId],
    queryFn: () => api.campaigns(brandId!),
    enabled: !!brandId,
  });
  const campaign = campaigns.data?.find((c) => c.id === id);

  // Whether the email has actually reached anybody. This — not `status` — decides
  // what may still be edited, exactly as the backend does it: a "sent" campaign
  // whose every attempt failed reached nobody and is still fully editable.
  // Rows still at "sending" count as delivered (a crash right after SES accepted
  // the message leaves exactly that), matching the backend's rule.
  const recipients = useQuery({ queryKey: ["recipients", id], queryFn: () => api.recipients(id) });
  const delivered = (recipients.data ?? []).filter((r) => r.status === "sent" || r.status === "sending").length;
  // Until the answer is actually known, assume locked. Defaulting to "open" would
  // show every field editable for a second on a delivered campaign, and let
  // someone rewrite a long body only to lose it to a 409 on save.
  const countKnown = recipients.isSuccess;
  // Nothing may be typed before the campaign itself has loaded: the fields would
  // start empty, and anything typed into that gap would look like a deliberate
  // edit and overwrite the real body on save.
  const loaded = !!campaign;
  const contentLocked = !loaded || !countKnown || delivered > 0;
  const isSending = campaign?.status === "sending";
  // The audience was frozen for the current category when the send was scheduled,
  // so the backend refuses a category change until the schedule is cancelled.
  // Disable it here too — all changed fields go in one request, so a rejected
  // category would take an unrelated name fix down with it.
  const categoryLocked = contentLocked || campaign?.status === "scheduled";
  const notFound = campaigns.isSuccess && !campaign;

  // Each field is an override: null means "show what is saved". Deriving instead of
  // copying into state on load means a refetch never overwrites what you are typing.
  const [nameOv, setNameOv] = useState<string | null>(null);
  const [categoryOv, setCategoryOv] = useState<string | null>(null);
  const [subjectOv, setSubjectOv] = useState<string | null>(null);
  const [htmlOv, setHtmlOv] = useState<string | null>(null);

  const name = nameOv ?? campaign?.name ?? "";
  const category = categoryOv ?? campaign?.category ?? "";
  const subject = subjectOv ?? campaign?.subject ?? "";
  const html = htmlOv ?? campaign?.html ?? "";

  // Send only what actually changed, so a locked campaign can still be renamed
  // without the request looking like a content edit (which the backend refuses).
  const changed = {
    ...(campaign && name !== campaign.name ? { name } : {}),
    ...(campaign && category !== campaign.category ? { category } : {}),
    ...(campaign && subject !== campaign.subject ? { subject } : {}),
    ...(campaign && html !== campaign.html ? { html } : {}),
  };
  const hasChanges = Object.keys(changed).length > 0;

  const saveMut = useMutation({
    mutationFn: () => api.updateCampaign(id, changed),
    onSuccess: () => {
      toast.success("Campaign updated");
      qc.invalidateQueries({ queryKey: ["campaigns", brandId] });
      router.push(`/campaigns/${id}`);
    },
    onError: (e: Error) => toast.error("Could not save: " + e.message),
  });

  const missing = !name || !category || !subject || !html;

  return (
    <>
      <PageHeader
        title="Edit campaign"
        subtitle={campaign ? campaign.name : "Loading…"}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/campaigns/${id}`)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={!campaign || isSending || missing || !hasChanges || saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      />

      <div className="grid w-full flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className="flex flex-col gap-4">
          {notFound && (
            <Callout tone="danger" icon={<Lock className="size-4" />}>
              This campaign no longer exists. It may have been deleted, or it belongs to another
              brand. <Link href="/campaigns" className="underline">Back to campaigns</Link>
            </Callout>
          )}

          {isSending && (
            <Callout tone="warn" icon={<Lock className="size-4" />}>
              This campaign is sending right now. You cannot change anything until it finishes.
            </Callout>
          )}

          {!isSending && !notFound && contentLocked && (
            <Callout tone="warn" icon={<Lock className="size-4" />}>
              {!countKnown ? (
                recipients.isError ? (
                  <>
                    <strong>We could not check if this was already sent.</strong> The subject and
                    content stay locked, to be safe.{" "}
                    <button onClick={() => recipients.refetch()} className="underline">Try again</button>
                  </>
                ) : (
                  <>Checking if this was already sent…</>
                )
              ) : (
                <>
                  <strong>Already sent to {delivered} {delivered === 1 ? "person" : "people"}.</strong>{" "}
                  You cannot change the subject or the content now, because the email is already in
                  their inbox. You can still change the name. To make a new version, use{" "}
                  <strong>Duplicate</strong> on the campaigns list.
                </>
              )}
            </Callout>
          )}

          <div className="flex flex-col gap-1.5">
            <Label required>Name (internal)</Label>
            <Input value={name} onChange={(e) => setNameOv(e.target.value)} disabled={isSending || !loaded} />
            <p className="text-xs text-muted-foreground">
              Only you see this name. Recipients never see it.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label required>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategoryOv(v ?? category)}
              disabled={isSending || categoryLocked}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a category…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {campaign?.status === "scheduled" && !contentLocked && (
              <p className="text-xs text-muted-foreground">
                Cancel the schedule to change the category. The audience was saved for the
                current one.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label required>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubjectOv(e.target.value)}
              disabled={isSending || contentLocked}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label required>Body (HTML)</Label>
            <Textarea
              rows={8}
              value={html}
              onChange={(e) => setHtmlOv(e.target.value)}
              disabled={isSending || contentLocked}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Live preview</Label>
          <iframe
            title="preview"
            srcDoc={html || "<p style='font-family:sans-serif;color:#999;padding:16px'>Nothing to preview yet.</p>"}
            sandbox=""
            className="min-h-[70vh] w-full flex-1 rounded-lg border bg-white"
          />
        </div>
      </div>
    </>
  );
}
