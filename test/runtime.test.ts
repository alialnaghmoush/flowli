import { describe, expect, test } from "bun:test";
import * as v from "valibot";

import {
  defineJobs,
  FlowliDefinitionError,
  FlowliStrategyError,
  job,
} from "../src/index.js";

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
});
