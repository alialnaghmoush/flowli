import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";

/** The minimal Hono context contract required by `honoJobs()`. */
export interface HonoLikeContext {
  set(key: string, value: unknown): void;
}

/** The continuation callback shape used by Hono middleware. */
export type HonoLikeNext = () => Promise<unknown>;

/** Options for attaching a Flowli runtime to Hono context. */
export interface HonoJobsOptions<TKey extends string = "flowli"> {
  readonly key?: TKey;
}

/** The typed variables shape added to Hono context by `honoJobs()`. */
export type HonoFlowliVariables<
  TFlowli,
  TKey extends string = "flowli",
> = Record<TKey, TFlowli>;

/** Creates Hono middleware that attaches an existing Flowli runtime to `c`. */
export function honoJobs<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
  TKey extends string = "flowli",
>(
  flowli: FlowliRuntime<TJobs, TContext>,
  options: HonoJobsOptions<TKey> = {},
): (context: HonoLikeContext, next: HonoLikeNext) => Promise<void> {
  const key = options.key ?? ("flowli" as TKey);

  return async (
    context: HonoLikeContext,
    next: HonoLikeNext,
  ): Promise<void> => {
    context.set(key, flowli);
    await next();
  };
}
