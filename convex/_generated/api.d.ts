/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as citations from "../citations.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as indexer from "../indexer.js";
import type * as indexerActions from "../indexerActions.js";
import type * as lib_drive from "../lib/drive.js";
import type * as lib_driveUrl from "../lib/driveUrl.js";
import type * as lib_extract from "../lib/extract.js";
import type * as limiter from "../limiter.js";
import type * as rag from "../rag.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  auth: typeof auth;
  chats: typeof chats;
  citations: typeof citations;
  folders: typeof folders;
  http: typeof http;
  indexer: typeof indexer;
  indexerActions: typeof indexerActions;
  "lib/drive": typeof lib_drive;
  "lib/driveUrl": typeof lib_driveUrl;
  "lib/extract": typeof lib_extract;
  limiter: typeof limiter;
  rag: typeof rag;
  workflow: typeof workflow;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
