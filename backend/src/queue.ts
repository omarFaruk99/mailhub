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
async function runSendJob(campaignId: string, jobId: string, isLastAttempt: boolean) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    console.warn(`[queue] campaign ${campaignId} no longer exists — skipping`);
    return;
  }

  // Claim the campaign in ONE conditional write, matching BOTH the status and
  // this exact job id.
  //   - One write, because read-then-write leaves a window where "Cancel
  //     schedule" reports success while this job is already on its way to sending.
  //   - The job id, because `Campaign.jobId` is the single source of truth for
  //     "which job may send this campaign". Cancelling a superseded job can fail
  //     (queue down, already gone) and pg-boss's `standard` policy does not
  //     deduplicate by singletonKey — so an orphaned job can still reach us. It
  //     must not be able to send the campaign at a time nobody asked for.
  // Status "sending" is accepted so a send interrupted by a crash can resume;
  // that is safe because a recipient row is unique per (campaign, contact).
  const claimed = await prisma.campaign.updateMany({
    where: { id: campaignId, jobId, status: { in: ["scheduled", "sending"] } },
    data: { status: "sending" },
  });
  if (claimed.count === 0) {
    console.warn(
      `[queue] campaign ${campaignId} is "${campaign.status}" with job ${campaign.jobId ?? "none"}, ` +
        `not this job (${jobId}) — skipping`
    );
    return;
  }

  try {
    const filter = (campaign.sendOptions ?? {}) as SendFilter;
    const result = await sendCampaign(campaignId, filter);
    console.log(`[queue] campaign ${campaignId} sent:`, result);
  } catch (err) {
    if (isLastAttempt) {
      // No retry left. "draft" would be indistinguishable from never-scheduled,
      // hiding the failure in a log nobody reads — mark it failed, which both
      // badges already render in red.
      console.error(`[queue] campaign ${campaignId} gave up after the last retry:`, err);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "failed", scheduledAt: null, timezone: null, jobId: null },
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
 * A campaign left at "sending" when the process died is unreachable: every
 * endpoint refuses it, and if its job also ran out of retries nothing will ever
 * finish it. At startup no send can be in flight yet (one backend process), so
 * anything still marked "sending" is wreckage from the last run — put it back to
 * scheduled if its job is still queued, otherwise to draft, and say so in the log.
 *
 * NOTE: this assumes a single backend process, which is how we deploy. Running
 * two would need a per-instance lock instead.
 */
async function recoverInterruptedSends(instance: PgBoss) {
  const stuck = await prisma.campaign.findMany({
    where: { status: "sending" },
    select: { id: true, name: true, jobId: true },
  });
  for (const c of stuck) {
    // Still a live job? Let it run again — exactly-once makes that safe.
    const found = c.jobId
      ? await instance.findJobs(SEND_QUEUE, { id: c.jobId }).catch(() => [])
      : [];
    const state = found[0]?.state;
    const stillQueued = state === "created" || state === "retry" || state === "active";
    await prisma.campaign.update({
      where: { id: c.id },
      data: stillQueued
        ? { status: "scheduled" }
        : { status: "draft", scheduledAt: null, timezone: null, jobId: null },
    });
    console.warn(
      `[queue] campaign "${c.name}" was interrupted mid-send — reset to ${stillQueued ? "scheduled" : "draft"}`
    );
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

    // A send is slow on purpose: one SES call per contact with a 200ms gap, so
    // ~5 contacts a second. pg-boss's default 15-minute expiry would reclaim a
    // job of more than ~4,500 contacts *while it is still running* and start a
    // second copy. An hour covers any list we will realistically send to.
    // (createQueue is a no-op once the queue exists, so updateQueue applies the
    // setting to a queue created before this option was added.)
    const queueOptions = { expireInSeconds: 3600 };
    await instance.createQueue(SEND_QUEUE, queueOptions);
    await instance.updateQueue(SEND_QUEUE, queueOptions);

    // BEFORE the worker starts: once jobs can be picked up, this would race with
    // a send that has just claimed its campaign and reset "sending" → "scheduled"
    // underneath it, disarming the "being sent right now" guards.
    await recoverInterruptedSends(instance);

    // One job at a time. No explicit generics here: pg-boss picks the
    // with-metadata handler shape from the literal `includeMetadata: true`,
    // and naming the types would erase it.
    await instance.work(
      SEND_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 10, includeMetadata: true },
      async (jobs: JobWithMetadata<SendJobData>[]) => {
        for (const job of jobs) {
          await runSendJob(job.data.campaignId, job.id, job.retryCount >= job.retryLimit);
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
