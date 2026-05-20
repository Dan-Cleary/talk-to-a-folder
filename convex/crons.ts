import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * The only cron in the app. Drive watch channels expire in ~7 days; this
 * sweeps users whose channel is within 24h of expiring and re-subscribes
 * them. Webhook delivery is real-time — this cron exists ONLY to keep the
 * webhook subscription alive, not to poll for changes.
 */
export const renewExpiringWatches = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.runQuery(
      internal.driveWebhook.listUsersWithExpiringWatches,
      { withinMs: 24 * 60 * 60 * 1000 },
    );
    for (const u of users) {
      await ctx.runAction(internal.driveWebhook.ensureChangesWatch, {
        userId: u._id,
      });
    }
  },
});

const crons = cronJobs();
crons.daily(
  "renew drive watch channels",
  { hourUTC: 8, minuteUTC: 0 },
  internal.crons.renewExpiringWatches,
);
export default crons;
