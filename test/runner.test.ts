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
      expect(await driver.recoverExpiredLeases(Date.now())).toBe(1);
      expect(await runner.runOnce()).toBe(1);
    });

    expect(context.calls).toEqual(["recover-me"]);
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
});
