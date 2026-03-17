import type {
  AnyJobDefinition,
  FlowliContextRecord,
  FlowliJobSurface,
  FlowliRuntimeInternals,
  JobDefaults,
} from "../core/types.js";
import { delayStrategy } from "../strategies/delay.js";
import { enqueueStrategy } from "../strategies/enqueue.js";
import { runStrategy } from "../strategies/run.js";
import { scheduleStrategy } from "../strategies/schedule.js";

export function createJobSurface<
  TJob extends AnyJobDefinition,
  TContext extends FlowliContextRecord,
>(
  job: TJob,
  internals: FlowliRuntimeInternals<Record<string, TJob>, TContext>,
): FlowliJobSurface<TJob> {
  const defaults = mergeDefaults(internals.defaults, job.defaults);

  return {
    run: (input, options) =>
      runStrategy(job, internals, defaults, input, options?.meta),
    enqueue: (input, options) =>
      enqueueStrategy(job, internals, defaults, Date.now(), input, options),
    delay: (delay, input, options) =>
      delayStrategy(
        job,
        internals,
        defaults,
        Date.now(),
        delay,
        input,
        options,
      ),
    schedule: (invocation) =>
      scheduleStrategy(job, internals, defaults, Date.now(), invocation),
  };
}

function mergeDefaults(
  globalDefaults: JobDefaults,
  jobDefaults?: JobDefaults,
): JobDefaults {
  return {
    ...(jobDefaults?.maxAttempts !== undefined ||
    globalDefaults.maxAttempts !== undefined
      ? { maxAttempts: jobDefaults?.maxAttempts ?? globalDefaults.maxAttempts }
      : {}),
    ...((jobDefaults?.backoff ?? globalDefaults.backoff)
      ? { backoff: jobDefaults?.backoff ?? globalDefaults.backoff }
      : {}),
  };
}
