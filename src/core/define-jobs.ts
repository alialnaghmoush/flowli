import { createJobSurface } from "../runtime/create-job-surface.js";
import { normalizeJobs } from "../runtime/normalize-jobs.js";
import { createContextResolver } from "../runtime/resolve-context.js";
import { createContextualJobFactory } from "./job.js";
import type {
  DefineJobsFactoryOptions,
  DefineJobsOptions,
  EnsureJobContexts,
  FlowliContextRecord,
  FlowliContextResolver,
  FlowliRuntime,
  FlowliRuntimeInternals,
  JobDefaults,
  JobsRecord,
} from "./types.js";
import { FLOWLI_RUNTIME_SYMBOL as runtimeSymbol } from "./types.js";

type DefineJobsFunction = {
  <const TJobs extends JobsRecord, TContext extends FlowliContextRecord>(
    options: DefineJobsFactoryOptions<TJobs, TContext>,
  ): FlowliRuntime<TJobs, TContext>;
  withContext<TContext extends FlowliContextRecord>(): <
    const TJobs extends JobsRecord,
  >(
    options: DefineJobsOptions<EnsureJobContexts<TJobs, TContext>, TContext>,
  ) => FlowliRuntime<EnsureJobContexts<TJobs, TContext>, TContext>;
};

function defineJobsFromFactory<
  const TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(
  options: DefineJobsFactoryOptions<TJobs, TContext>,
): FlowliRuntime<TJobs, TContext> {
  const resolvedJobs = options.jobs({
    job: createContextualJobFactory<TContext>(),
  });

  return buildRuntime(
    resolvedJobs,
    options.context,
    options.driver,
    options.defaults,
  );
}

function defineJobsFromObject<
  const TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(
  options: DefineJobsOptions<EnsureJobContexts<TJobs, TContext>, TContext>,
): FlowliRuntime<EnsureJobContexts<TJobs, TContext>, TContext> {
  return buildRuntime(
    options.jobs,
    options.context,
    options.driver,
    options.defaults,
  );
}

function buildRuntime<
  const TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(
  jobs: TJobs,
  context: FlowliContextResolver<TContext>,
  driver: FlowliRuntimeInternals<TJobs, TContext>["driver"],
  defaultsInput: JobDefaults | undefined,
): FlowliRuntime<TJobs, TContext> {
  const normalized = normalizeJobs(jobs);
  const defaults: JobDefaults = {
    maxAttempts: defaultsInput?.maxAttempts ?? 1,
    ...(defaultsInput?.backoff ? { backoff: defaultsInput.backoff } : {}),
  };
  const internals = {
    jobs: normalized.jobs,
    jobsByName: normalized.jobsByName,
    context: createContextResolver(context),
    ...(driver ? { driver } : {}),
    defaults,
  } satisfies FlowliRuntimeInternals<TJobs, TContext>;

  const runtime: Record<string, unknown> = {};

  for (const [exportName, definition] of Object.entries(normalized.jobs)) {
    runtime[exportName] = createJobSurface(
      definition,
      internals as FlowliRuntimeInternals<
        Record<string, typeof definition>,
        TContext
      >,
    );
  }

  Object.defineProperty(runtime, runtimeSymbol, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: internals,
  });

  return runtime as FlowliRuntime<TJobs, TContext>;
}

export const defineJobs: DefineJobsFunction = Object.assign(
  defineJobsFromFactory,
  {
    withContext<TContext extends FlowliContextRecord>() {
      return <const TJobs extends JobsRecord>(
        options: DefineJobsOptions<
          EnsureJobContexts<TJobs, TContext>,
          TContext
        >,
      ) => defineJobsFromObject(options);
    },
  },
);

export function getFlowliRuntimeInternals<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(
  runtime: FlowliRuntime<TJobs, TContext>,
): FlowliRuntimeInternals<TJobs, TContext> {
  return runtime[runtimeSymbol];
}
