import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { workflow } from "./workflow";

/**
 * Orchestrator workflow. Lists queued files, runs indexOneFile per file
 * (with parallelism limited by the workpool), marks the folder ready.
 *
 * Lives outside "use node" because workflow.define generates a Convex
 * mutation under the hood; the heavy lifting (PDF parsing, fetches) is
 * delegated to actions in indexerActions.ts.
 */
export const indexFolderWorkflow = workflow.define({
  args: { folderId: v.id("folders"), userId: v.id("users") },
  handler: async (step, args): Promise<{ indexed: number; failed: number }> => {
    const queued: Array<Id<"files">> = await step.runQuery(
      internal.folders.listQueuedFileIds,
      { folderId: args.folderId },
    );

    let indexed = 0;
    let failed = 0;
    const BATCH = 5;
    for (let i = 0; i < queued.length; i += BATCH) {
      const slice = queued.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        slice.map((fileId) =>
          step.runAction(
            internal.indexerActions.indexOneFile,
            { fileId, userId: args.userId },
            { retry: true },
          ),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") indexed++;
        else failed++;
      }
    }

    await step.runMutation(internal.folders.markFolderReady, {
      folderId: args.folderId,
    });

    return { indexed, failed };
  },
});
