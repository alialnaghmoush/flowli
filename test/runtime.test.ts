import { describe, expect, test } from "bun:test";
import * as v from "valibot";

import {
  defineJobs,
  FlowliDefinitionError,
  FlowliDriverError,
  FlowliStrategyError,
  job,
} from "../src/index.js";
import { ioredisDriver } from "../src/ioredis.js";
import { createMemoryRedisClients } from "./helpers/memory-redis.js";

type AppContext = {
  logger: {
    info(message: string): void;
  };
  prefix: string;
};

describe("runtime", () => {
  test("defineJobs can author typed jobs from runtime context", async () => {
    const events: string[] = [];
    const flowli = defineJobs({
      context: {
        prefix: "runtime:",
        logger: {
          info(message: string) {
            events.push(message);
          },
        },
      },
      jobs: ({ job }) => ({
        typedGreet: job("typed_greet", {
          input: v.object({
            name: v.string(),
          }),
          meta: v.object({
            requestId: v.string(),
          }),
          handler: async ({ input, ctx, meta }) => {
            ctx.logger.info(meta?.requestId ?? "missing");
            return `${ctx.prefix}${input.name}`;
          },
        }),
      }),
    });

    await expect(
      flowli.typedGreet.run(
        { name: "world" },
        {
          meta: {
            requestId: "req_runtime",
          },
        },
      ),
    ).resolves.toBe("runtime:world");
    expect(events).toEqual(["req_runtime"]);
  });

  test("run() works without a driver and passes typed meta", async () => {
    const events: string[] = [];
    const greet = job.withContext<AppContext>()("greet", {
      input: v.object({
        name: v.string(),
      }),
      meta: v.object({
        requestId: v.string(),
      }),
      handler: async ({ input, ctx, meta }) => {
        ctx.logger.info(`${meta?.requestId}:${input.name}`);
        return `${ctx.prefix}${input.name}`;
      },
    });

    const flowli = defineJobs.withContext<AppContext>()({
      jobs: { greet },
      context: {
        prefix: "hello ",
        logger: {
          info(message: string) {
            events.push(message);
          },
        },
      },
    });

    const result = await flowli.greet.run(
      { name: "world" },
      {
        meta: { requestId: "req_1" },
      },
    );

    expect(result).toBe("hello world");
    expect(events).toEqual(["req_1:world"]);
  });

  test("context can be an async function", async () => {
    const trace: string[] = [];
    const ping = job.withContext<AppContext>()("ping", {
      input: v.object({
        value: v.string(),
      }),
      handler: async ({ input, ctx }) => {
        ctx.logger.info(input.value);
        return `${ctx.prefix}${input.value}`;
      },
    });

    const flowli = defineJobs.withContext<AppContext>()({
      jobs: { ping },
      context: async () => ({
        prefix: "ctx:",
        logger: {
          info(message: string) {
            trace.push(message);
          },
        },
      }),
    });

    await expect(flowli.ping.run({ value: "ok" })).resolves.toBe("ctx:ok");
    expect(trace).toEqual(["ok"]);
  });

  test("duplicate job names are rejected", () => {
    const duplicate = job("duplicate", {
      input: v.object({
        name: v.string(),
      }),
      handler: ({ input }) => input.name,
    });

    expect(() =>
      defineJobs.withContext<Record<string, never>>()({
        jobs: {
          one: duplicate,
          two: job("duplicate", {
            input: v.object({
              name: v.string(),
            }),
            handler: ({ input }) => input.name,
          }),
        },
        context: {},
      }),
    ).toThrow(FlowliDefinitionError);
  });

  test("enqueue requires a driver", async () => {
    const flowli = defineJobs({
      context: {},
      jobs: ({ job }) => ({
        greet: job("greet", {
          input: v.object({
            name: v.string(),
          }),
          handler: ({ input }) => input.name,
        }),
      }),
    });

    await expect(
      flowli.greet.enqueue({ name: "world" }),
    ).rejects.toBeInstanceOf(FlowliStrategyError);
  });

  test("inspect exposes jobs, schedules, and queue counts through the runtime", async () => {
    const clients = createMemoryRedisClients();
    const flowli = defineJobs({
      context: {},
      driver: ioredisDriver({
        client: clients.ioredis,
        prefix: "inspect",
      }),
      jobs: ({ job }) => ({
        greet: job("greet", {
          input: v.object({
            name: v.string(),
          }),
          handler: async ({ input }) => input.name,
        }),
      }),
    });

    const receipt = await flowli.greet.enqueue({ name: "queued" });
    const schedule = await flowli.greet.schedule({
      key: "daily-greet",
      cron: "0 * * * *",
      input: {
        name: "scheduled",
      },
    });

    await expect(flowli.inspect.getJob(receipt.id)).resolves.toMatchObject({
      id: receipt.id,
      name: "greet",
      state: "queued",
    });
    await expect(
      flowli.inspect.getSchedule(schedule.key),
    ).resolves.toMatchObject({
      key: schedule.key,
      name: "greet",
      cron: "0 * * * *",
    });
    await expect(flowli.inspect.getQueueCounts()).resolves.toEqual({
      queued: 1,
      active: 0,
      completed: 0,
      failed: 0,
      schedules: 1,
    });
    await expect(
      flowli.inspect.getJobsByState("queued"),
    ).resolves.toMatchObject([{ id: receipt.id }]);
    await expect(flowli.inspect.getSchedules()).resolves.toMatchObject([
      { key: "daily-greet" },
    ]);
  });

  test("inspect requires a configured driver", async () => {
    const flowli = defineJobs({
      context: {},
      jobs: ({ job }) => ({
        greet: job("greet", {
          input: v.object({
            name: v.string(),
          }),
          handler: ({ input }) => input.name,
        }),
      }),
    });

    await expect(flowli.inspect.getQueueCounts()).rejects.toBeInstanceOf(
      FlowliDriverError,
    );
  });

  test('job export name "inspect" is reserved', () => {
    expect(() =>
      defineJobs({
        context: {},
        jobs: ({ job }) => ({
          inspect: job("inspect_job", {
            input: v.object({
              name: v.string(),
            }),
            handler: ({ input }) => input.name,
          }),
        }),
      }),
    ).toThrow(FlowliDefinitionError);
  });
});
