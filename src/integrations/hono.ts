import type {
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";

export interface HonoLikeContext {
  set(key: string, value: unknown): void;
}

export type HonoLikeNext = () => Promise<unknown>;

export interface HonoJobsOptions<TKey extends string = "flowli"> {
  readonly key?: TKey;
}

export type HonoFlowliVariables<
  TFlowli,
  TKey extends string = "flowli",
> = Record<TKey, TFlowli>;

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
