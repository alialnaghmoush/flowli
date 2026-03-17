import { FlowliStrategyError } from "../core/errors.js";
import type {
  AnyJobDefinition,
  FlowliContextRecord,
  FlowliRuntimeInternals,
  JobDefaults,
  JobReceipt,
  PersistedInvocationOptions,
} from "../core/types.js";
import { createPersistedJobRecord } from "../driver/records.js";
import { createJobId } from "../driver/scheduling.js";
import { validateWithSchema } from "../runtime/validate.js";

export async function enqueueStrategy<
  TJob extends AnyJobDefinition,
  TContext extends FlowliContextRecord,
>(
  job: TJob,
  internals: FlowliRuntimeInternals<Record<string, TJob>, TContext>,
  defaults: JobDefaults,
  now: number,
  input: unknown,
  options?: PersistedInvocationOptions<unknown>,
): Promise<JobReceipt> {
  const driver = requireDriver(internals.driver, job.name, "enqueue");
  const validatedInput = await validateWithSchema(
    job.input,
    input,
    `${job.name} input`,
  );
  const validatedMeta = job.meta
    ? await validateWithSchema(job.meta, options?.meta, `${job.name} meta`)
    : undefined;
  const record = createPersistedJobRecord({
    id: createJobId(),
    name: job.name,
    input: validatedInput,
    meta: validatedMeta,
    scheduledFor: now,
    maxAttempts: options?.maxAttempts ?? defaults.maxAttempts ?? 1,
    ...((options?.backoff ?? defaults.backoff)
      ? { backoff: options?.backoff ?? defaults.backoff }
      : {}),
    now,
  });

  return driver.enqueue(record);
}

function requireDriver<TDriver>(
  driver: TDriver | undefined,
  jobName: string,
  strategy: string,
): TDriver {
  if (!driver) {
    throw new FlowliStrategyError(
      `Job "${jobName}" cannot use ${strategy}() without a configured driver.`,
    );
  }

  return driver;
}
