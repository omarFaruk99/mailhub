// Job queue. pg-boss stores its jobs in our own PostgreSQL (no Redis), so a
// scheduled send survives a server restart — the job is a database row.
import { PgBoss, type JobWithMetadata } from "pg-boss";
import { prisma } from "./prisma.js";
import { sendCampaign, type SendFilter } from "./email/send-campaign.js";

export const SEND_QUEUE = "campaign-send";

export type SendJobData = { campaignId: string };

let boss: PgBoss | null = null;

/** The running queue, or null before startQueue() finishes / if it failed. */
export function getQueue(): PgBoss | null {
  return boss;
}

// One scheduled send. Runs with nobody on screen, so it re-reads everything it
// needs from the database and is safe to run twice (see the guards below).
async function runSendJob(campaignId: string, isLastAttempt: boolean) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    console.warn(`[queue] campaign ${campaignId} no longer exists — skipping`);
    return;
  }

  // Claim the campaign in ONE conditional write. Doing it as read-then-write
  // would leave a window where "Cancel schedule" reports success while this job
  // is already on its way to sending.
  //   - "scheduled" → the normal case.
  //   - "sending"   → a previous attempt died mid-send (crash / restart) and
  //                   pg-boss handed the job back; re-running is safe because a
  //                   recipient row is unique per (campaign, contact).
  // Anything else — "draft" (cancelled) or "sent" — means this job is stale.
  const claimed = await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: ["scheduled", "sending"] } },
    data: { status: "sending" },
  });
  if (claimed.count === 0) {
    console.warn(`[queue] campaign ${campaignId} is "${campaign.status}" — skipping this job`);
    return;
  }

  try {
    const filter = (campaign.sendOptions ?? {}) as SendFilter;
    const result = await sendCampaign(campaignId, filter);
    console.log(`[queue] campaign ${campaignId} sent:`, result);
  } catch (err) {
    if (isLastAttempt) {
      // No retry left. Leaving it "scheduled" would show a time in the UI that
      // nothing will ever act on, so put it back to draft — visibly not sent.
      console.error(`[queue] campaign ${campaignId} gave up after the last retry:`, err);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "draft", scheduledAt: null, timezone: null, jobId: null },
      });
    } else {
      // Back to "scheduled" so the retry finds it in the state the guard expects;
      // otherwise the retry would skip it as "sending".
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "scheduled" } });
    }
    throw err;
  }
}

/**
 * Start pg-boss and register the send worker. Called once at server startup.
 * A failure here must not take the API down — sending now still works without
 * the queue; only scheduling does not (the schedule endpoint checks getQueue()).
 */
export async function startQueue(): Promise<PgBoss | null> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[queue] DATABASE_URL missing — scheduling is disabled");
    return null;
  }

  try {
    const instance = new PgBoss(url);
    instance.on("error", (err: unknown) => console.error("[queue] error:", err));

    await instance.start();
    await instance.createQueue(SEND_QUEUE);

    // A campaign send is long (one SES call per contact, rate-limited), so take
    // one job at a time and give it a generous window before pg-boss reclaims it.
    // No explicit generics here: pg-boss picks the with-metadata handler shape
    // from the literal `includeMetadata: true`, and naming the types would erase it.
    await instance.work(
      SEND_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 10, includeMetadata: true },
      async (jobs: JobWithMetadata<SendJobData>[]) => {
        for (const job of jobs) {
          await runSendJob(job.data.campaignId, job.retryCount >= job.retryLimit);
        }
      }
    );

    boss = instance;
    console.log("[queue] pg-boss started");
    return instance;
  } catch (err) {
    console.error("[queue] failed to start — scheduling is disabled:", err);
    return null;
  }
}

export async function stopQueue() {
  const instance = boss;
  boss = null;
  if (instance) await instance.stop({ graceful: true });
}
