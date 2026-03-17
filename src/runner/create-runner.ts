import { getFlowliRuntimeInternals } from "../core/define-jobs.js";
import { FlowliDriverError, FlowliStrategyError } from "../core/errors.js";
import type {
  AnyJobDefinition,
  FlowliContextRecord,
  FlowliRuntime,
  JobsRecord,
} from "../core/types.js";
import { createPersistedJobError } from "../driver/records.js";
import { invokeHandler } from "../runtime/invoke-handler.js";
import { validateWithSchema } from "../runtime/validate.js";
import type { FlowliRunner, RunnerOptions } from "./types.js";

export function createRunner<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(options: RunnerOptions<TJobs, TContext>): FlowliRunner {
  const internals = getFlowliRuntimeInternals(options.flowli);
  if (!internals.driver) {
    throw new FlowliDriverError(
      "createRunner() requires a Flowli runtime with a configured driver.",
    );
  }

  const driver = internals.driver;
  const concurrency = Math.max(options.concurrency ?? 1, 1);
  const pollIntervalMs = Math.max(options.pollIntervalMs ?? 1_000, 10);
  const leaseMs = Math.max(options.leaseMs ?? 30_000, 1_000);
  const maxJobsPerTick = Math.max(options.maxJobsPerTick ?? concurrency, 1);
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticking = false;

  return {
    get running() {
      return running;
    },
    async runOnce() {
      if (ticking) {
        return 0;
      }

      ticking = true;
      try {
        await driver.materializeDueSchedules(Date.now(), leaseMs);
        let processed = 0;

        while (processed < maxJobsPerTick) {
          const batch = await Promise.all(
            Array.from(
              { length: Math.min(concurrency, maxJobsPerTick - processed) },
              () => processNext(),
            ),
          );
          const completed = batch.reduce((count, value) => count + value, 0);
          processed += completed;
          if (completed === 0) {
            break;
          }
        }

        return processed;
      } finally {
        ticking = false;
      }
    },
    async start() {
      if (running) {
        return;
      }

      running = true;
      const loop = async () => {
        if (!running) {
          return;
        }

        await this.runOnce();
        timer = setTimeout(loop, pollIntervalMs);
      };
      await loop();
    },
    async stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };

  async function processNext(): Promise<number> {
    const acquired = await driver.acquireNextReady(Date.now(), leaseMs);
    if (!acquired) {
      return 0;
    }

    const job = internals.jobsByName.get(acquired.record.name);
    if (!job) {
      throw new FlowliStrategyError(
        `No registered job named "${acquired.record.name}" found for runner execution.`,
      );
    }

    const heartbeat = setInterval(
      () => {
        void driver.renewLease(acquired.record.id, acquired.token, leaseMs);
      },
      Math.max(Math.floor(leaseMs / 2), 250),
    );

    try {
      await options.hooks?.onJobStarted?.(
        acquired.record.id,
        acquired.record.name,
      );
      await executePersistedJob(
        job,
        options.flowli,
        acquired.record.input,
        acquired.record.meta,
      );
      clearInterval(heartbeat);
      await driver.markCompleted(acquired, Date.now());
      await options.hooks?.onJobCompleted?.(
        acquired.record.id,
        acquired.record.name,
      );
      return 1;
    } catch (error) {
      clearInterval(heartbeat);
      const serialized = createPersistedJobError(error);
      await driver.markFailed(acquired, Date.now(), serialized);
      await options.hooks?.onJobFailed?.(
        acquired.record.id,
        acquired.record.name,
        serialized,
      );
      return 1;
    }
  }
}

async function executePersistedJob<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
>(
  job: AnyJobDefinition,
  flowli: FlowliRuntime<TJobs, TContext>,
  input: unknown,
  meta: unknown,
): Promise<void> {
  const internals = getFlowliRuntimeInternals(flowli);
  const validatedInput = await validateWithSchema(
    job.input,
    input,
    `${job.name} input`,
  );
  const validatedMeta = job.meta
    ? await validateWithSchema(job.meta, meta, `${job.name} meta`)
    : undefined;
  const context = await internals.context();

  await invokeHandler(job, validatedInput, context, validatedMeta as never);
}
