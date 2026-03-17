import { describe, expect, test } from "bun:test";
import * as v from "valibot";

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
});
