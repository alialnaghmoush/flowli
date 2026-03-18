import { describe, expect, test } from "bun:test";
import * as v from "valibot";

import { getFlowliRuntimeInternals } from "../src/core/define-jobs.js";
import { defineJobs, job } from "../src/index.js";
import { ioredisDriver } from "../src/ioredis.js";
import { createRunner } from "../src/runner.js";
import { createMemoryRedisClients } from "./helpers/memory-redis.js";
import { withFakeNow } from "./helpers/time.js";

type Context = {
  calls: string[];
  failures: number;
};

async function withMockRandom<TValue>(
  value: number,
  run: () => Promise<TValue>,
): Promise<TValue> {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await run();
  } finally {
    Math.random = original;
  }
}

describe("runner", () => {
  test("createRunner requires a configured driver", () => {
    const flowli = defineJobs({
      context: {},
      jobs: ({ job }) => ({
        task: job("task", {
          input: v.object({
            value: v.string(),
          }),
          handler: async () => undefined,
        }),
      }),
    });

    expect(() => createRunner({ flowli })).toThrow(
      "createRunner() requires a Flowli runtime with a configured driver.",
    );
  });

  test("createRunner consumes an existing configured runtime", async () => {
    const clients = createMemoryRedisClients();
    const task = job.withContext<Context>()("task", {
      input: v.object({
        value: v.string(),
      }),
      handler: async ({ input, ctx }) => {
        ctx.calls.push(input.value);
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { task },
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "runner",
      }),
      context: {
        calls: [],
        failures: 0,
      },
    });

    const runner = createRunner({
      flowli,
      leaseMs: 1_000,
    });

    await flowli.task.enqueue({ value: "queued" });
    const processed = await runner.runOnce();

    expect(processed).toBe(1);
    await expect(flowli.task.run({ value: "inline" })).resolves.toBeUndefined();
  });

  test("runner processes queued, delayed, scheduled, and retried jobs", async () => {
    const clients = createMemoryRedisClients();
    const context: Context = {
      calls: [],
      failures: 0,
    };
    const audit = job.withContext<Context>()("audit", {
      input: v.object({
        value: v.string(),
      }),
      defaults: {
        maxAttempts: 2,
        backoff: {
          type: "fixed",
          delayMs: 1_000,
        },
      },
      handler: async ({ input, ctx }) => {
        if (input.value === "retry" && ctx.failures === 0) {
          ctx.failures += 1;
          throw new Error("boom");
        }
        ctx.calls.push(input.value);
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { audit },
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "async",
      }),
      context,
    });
    const runner = createRunner({
      flowli,
      leaseMs: 5_000,
      maxJobsPerTick: 5,
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 0), async () => {
      await flowli.audit.enqueue({ value: "queued" });
      await flowli.audit.delay("5m", { value: "delayed" });
      const firstSchedule = await flowli.audit.schedule({
        cron: "*/5 * * * *",
        input: { value: "scheduled" },
      });
      const secondSchedule = await flowli.audit.schedule({
        cron: "*/5 * * * *",
        input: { value: "scheduled" },
      });
      await flowli.audit.enqueue({ value: "retry" });

      expect(firstSchedule.key).toBe(secondSchedule.key);
      expect(await runner.runOnce()).toBe(2);
      expect(context.calls).toEqual(["queued"]);
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 1, 0), async () => {
      expect(await runner.runOnce()).toBe(1);
      expect(context.calls).toEqual(["queued", "retry"]);
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 5, 0), async () => {
      expect(await runner.runOnce()).toBe(2);
      expect([...context.calls].sort()).toEqual(
        ["delayed", "queued", "retry", "scheduled"].sort(),
      );
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 5, 1), async () => {
      expect(await runner.runOnce()).toBe(0);
    });
  });

  test("concurrent runners do not process the same queued job twice", async () => {
    const clients = createMemoryRedisClients();
    const context: Context = {
      calls: [],
      failures: 0,
    };
    const task = job.withContext<Context>()("task", {
      input: v.object({
        value: v.string(),
      }),
      handler: async ({ input, ctx }) => {
        await Promise.resolve();
        ctx.calls.push(input.value);
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { task },
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "concurrent",
      }),
      context,
    });

    const runnerA = createRunner({ flowli, leaseMs: 5_000 });
    const runnerB = createRunner({ flowli, leaseMs: 5_000 });

    await flowli.task.enqueue({ value: "once" });

    const [processedA, processedB] = await Promise.all([
      runnerA.runOnce(),
      runnerB.runOnce(),
    ]);

    expect(processedA + processedB).toBe(1);
    expect(context.calls).toEqual(["once"]);
  });

  test("driver prevents duplicate reservation for the same pending job", async () => {
    const clients = createMemoryRedisClients();
    const flowli = defineJobs({
      jobs: ({ job }) => ({
        task: job("task", {
          input: v.object({
            value: v.string(),
          }),
          handler: async () => undefined,
        }),
      }),
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "reservation",
      }),
      context: {},
    });

    await flowli.task.enqueue({ value: "job-1" });
    const driver = getFlowliRuntimeInternals(flowli).driver!;

    const [first, second] = await Promise.all([
      driver.acquireNextReady(Date.now(), 5_000),
      driver.acquireNextReady(Date.now(), 5_000),
    ]);

    expect(Boolean(first)).toBe(true);
    expect(second).toBeNull();
  });

  test("expired active leases are recovered and re-queued", async () => {
    const clients = createMemoryRedisClients();
    const context: Context = {
      calls: [],
      failures: 0,
    };
    const task = job.withContext<Context>()("task", {
      input: v.object({
        value: v.string(),
      }),
      handler: async ({ input, ctx }) => {
        ctx.calls.push(input.value);
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { task },
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "lease-recovery",
      }),
      context,
    });
    const driver = getFlowliRuntimeInternals(flowli).driver!;
    const runner = createRunner({
      flowli,
      leaseMs: 1_000,
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 0), async () => {
      await flowli.task.enqueue({ value: "recover-me" });
      const acquired = await driver.acquireNextReady(Date.now(), 1_000);

      expect(acquired?.record.state).toBe("active");
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 2), async () => {
      await expect(
        driver.recoverExpiredLeases(Date.now()),
      ).resolves.toHaveLength(1);
      expect(await runner.runOnce()).toBe(1);
    });

    expect(context.calls).toEqual(["recover-me"]);
  });

  test("runner emits lease recovery hooks before reprocessing recovered jobs", async () => {
    const clients = createMemoryRedisClients();
    const context: Context = {
      calls: [],
      failures: 0,
    };
    const recovered: string[] = [];
    const task = job.withContext<Context>()("task", {
      input: v.object({
        value: v.string(),
      }),
      handler: async ({ input, ctx }) => {
        ctx.calls.push(input.value);
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { task },
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "lease-hook",
      }),
      context,
    });
    const driver = getFlowliRuntimeInternals(flowli).driver!;
    const runner = createRunner({
      flowli,
      leaseMs: 1_000,
      hooks: {
        onLeaseRecovered(jobId, jobName) {
          recovered.push(`${jobName}:${jobId}`);
        },
      },
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 0), async () => {
      await flowli.task.enqueue({ value: "recover-once" });
      const acquired = await driver.acquireNextReady(Date.now(), 1_000);

      expect(acquired?.record.state).toBe("active");
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 2), async () => {
      expect(await runner.runOnce()).toBe(1);
      expect(recovered).toHaveLength(1);
      expect(recovered[0]?.startsWith("task:")).toBe(true);
      expect(context.calls).toEqual(["recover-once"]);
    });
  });

  test("concurrent schedule materialization stays idempotent", async () => {
    const clients = createMemoryRedisClients();
    const flowli = defineJobs({
      jobs: ({ job }) => ({
        audit: job("audit", {
          input: v.object({
            value: v.string(),
          }),
          handler: async () => undefined,
        }),
      }),
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "schedule-idempotency",
      }),
      context: {},
    });
    const driver = getFlowliRuntimeInternals(flowli).driver!;

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 0), async () => {
      await flowli.audit.schedule({
        cron: "*/5 * * * *",
        input: {
          value: "scheduled-once",
        },
      });
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 5, 0), async () => {
      const [materializedA, materializedB] = await Promise.all([
        driver.materializeDueSchedules(Date.now(), 5_000),
        driver.materializeDueSchedules(Date.now(), 5_000),
      ]);

      expect(materializedA + materializedB).toBe(1);

      const acquired = await driver.acquireNextReady(Date.now(), 5_000);
      expect(acquired?.record.input).toEqual({
        value: "scheduled-once",
      });
      expect(await driver.acquireNextReady(Date.now(), 5_000)).toBeNull();
    });
  });

  test("exponential backoff honors maxDelayMs and persists retry metadata", async () => {
    const clients = createMemoryRedisClients();
    const context: Context = {
      calls: [],
      failures: 0,
    };
    const task = job.withContext<Context>()("task", {
      input: v.object({
        value: v.string(),
      }),
      defaults: {
        maxAttempts: 4,
        backoff: {
          type: "exponential",
          delayMs: 1_000,
          maxDelayMs: 1_500,
        },
      },
      handler: async ({ ctx }) => {
        ctx.failures += 1;
        throw new Error("retry me");
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { task },
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "backoff-cap",
      }),
      context,
    });
    const driver = getFlowliRuntimeInternals(flowli).driver!;

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 0), async () => {
      await flowli.task.enqueue({ value: "retry" });
      const acquired = await driver.acquireNextReady(Date.now(), 5_000);

      expect(acquired).not.toBeNull();
      const result = await driver.markFailed(acquired!, Date.now(), {
        code: "FLOWLI_HANDLER_ERROR",
        message: "retry me",
      });

      expect(result).toEqual({
        state: "retrying",
        retryAt: Date.now() + 1_000,
      });
    });

    await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 1), async () => {
      const reacquired = await driver.acquireNextReady(Date.now(), 5_000);
      expect(reacquired?.record.nextRetryAt).toBe(Date.now());
      expect(reacquired?.record.lastFailedAt).toBe(
        Date.UTC(2026, 0, 1, 0, 0, 0),
      );
      expect(reacquired?.record.failureCount).toBe(1);

      const result = await driver.markFailed(reacquired!, Date.now(), {
        code: "FLOWLI_HANDLER_ERROR",
        message: "retry me again",
      });

      expect(result).toEqual({
        state: "retrying",
        retryAt: Date.now() + 1_500,
      });
    });
  });

  test("retry scheduling supports jitter and emits retry hooks", async () => {
    const clients = createMemoryRedisClients();
    const retries: Array<{
      jobId: string;
      jobName: string;
      retryAt: number;
      code: string;
    }> = [];
    const task = job("task", {
      input: v.object({
        value: v.string(),
      }),
      defaults: {
        maxAttempts: 2,
        backoff: {
          type: "fixed",
          delayMs: 1_000,
          jitter: {
            minRatio: 0.2,
            maxRatio: 0.4,
          },
        },
      },
      handler: async () => {
        throw new Error("boom");
      },
    });

    const flowli = defineJobs({
      jobs: () => ({ task }),
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "retry-hook",
      }),
      context: {},
    });
    const runner = createRunner({
      flowli,
      hooks: {
        onJobRetryScheduled(jobId, jobName, retryAt, error) {
          retries.push({
            jobId,
            jobName,
            retryAt,
            code: error.code,
          });
        },
      },
    });

    await withMockRandom(0.5, async () => {
      await withFakeNow(Date.UTC(2026, 0, 1, 0, 0, 0), async () => {
        await flowli.task.enqueue({ value: "retry" });
        expect(await runner.runOnce()).toBe(1);
      });
    });

    expect(retries).toHaveLength(1);
    expect(retries[0]?.jobName).toBe("task");
    expect(retries[0]?.code).toBe("FLOWLI_HANDLER_ERROR");
    expect(retries[0]?.retryAt).toBe(Date.UTC(2026, 0, 1, 0, 0, 0) + 300);
  });
});
