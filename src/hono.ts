/**
 * The `flowli/hono` entrypoint provides middleware helpers for attaching an
 * existing Flowli runtime to Hono context.
 */
export {
  type HonoFlowliVariables,
  type HonoJobsOptions,
  type HonoLikeContext,
  type HonoLikeNext,
  honoJobs,
} from "./integrations/hono.js";
