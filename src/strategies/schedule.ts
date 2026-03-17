import { FlowliStrategyError } from "../core/errors.js";
import type {
  AnyJobDefinition,
  FlowliContextRecord,
  FlowliRuntimeInternals,
  JobDefaults,
  ScheduleInvocation,
  ScheduleReceipt,
} from "../core/types.js";
import { createScheduleRecord } from "../driver/records.js";
import {
  deriveScheduleKey,
  getNextCronRun,
  validateCron,
} from "../driver/scheduling.js";
import { validateWithSchema } from "../runtime/validate.js";

export async function scheduleStrategy<
  TJob extends AnyJobDefinition,
  TContext extends FlowliContextRecord,
>(
  job: TJob,
  internals: FlowliRuntimeInternals<Record<string, TJob>, TContext>,
  defaults: JobDefaults,
  now: number,
  invocation: ScheduleInvocation<unknown, unknown>,
): Promise<ScheduleReceipt> {
  const driver = requireDriver(internals.driver, job.name, "schedule");
  validateCron(invocation.cron);
  const validatedInput = await validateWithSchema(
    job.input,
    invocation.input,
    `${job.name} input`,
  );
  const validatedMeta = job.meta
    ? await validateWithSchema(job.meta, invocation.meta, `${job.name} meta`)
    : undefined;
  const key =
    invocation.key ??
    deriveScheduleKey(job.name, invocation.cron, validatedInput);
  const nextRunAt = getNextCronRun(invocation.cron, now);
  const record = createScheduleRecord({
    key,
    name: job.name,
    cron: invocation.cron,
    input: validatedInput,
    meta: validatedMeta,
    maxAttempts: defaults.maxAttempts ?? 1,
    ...(defaults.backoff ? { backoff: defaults.backoff } : {}),
    nextRunAt,
    now,
  });

  return driver.registerSchedule(record);
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
