import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

/**
 * Centralized rate limits. Token-bucket per key.
 *
 * - drive_api: Google's per-user quota is generous (~1000/100s/user) but
 *   the per-project quota matters for the take-home reviewer running it
 *   on the same project. 60 requests/minute keeps us well under.
 * - openai_embed: OpenAI has high embedding RPM ceilings; this just
 *   smooths bursts when a folder has hundreds of files.
 */
export const limiter = new RateLimiter(components.rateLimiter, {
  drive_api: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 60 },
  openai_embed: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE,
    capacity: 120,
  },
});
