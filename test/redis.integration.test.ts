import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as v from "valibot";

import { defineJobs, job } from "../src/index.js";
import { ioredisDriver } from "../src/ioredis.js";
import { redisDriver } from "../src/redis.js";
import { createRunner } from "../src/runner.js";
import {
  createRealIoredisClient,
  createRealNodeRedisClient,
  createRedisTestPrefix,
  getRedisUrl,
} from "./helpers/real-redis.js";

type Context = {
  calls: string[];
};

const redisUrl = getRedisUrl();
const hasRealRedis = redisUrl !== null;

const describeRealRedis = hasRealRedis ? describe : describe.skip;

describeRealRedis("real redis integration", () => {
  let ioredisClient: Awaited<ReturnType<typeof createRealIoredisClient>>;
  let nodeRedisClient: Awaited<ReturnType<typeof createRealNodeRedisClient>>;

  beforeAll(async () => {
    ioredisClient = await createRealIoredisClient(redisUrl!);
    nodeRedisClient = await createRealNodeRedisClient(redisUrl!);

    if (!ioredisClient || !nodeRedisClient) {
      throw new Error(
        "FLOWLI_REDIS_URL is set but real Redis test clients could not be created.",
      );
    }
  });

  afterAll(async () => {
    await ioredisClient?.quit();
    await nodeRedisClient?.quit();
  });

  test("ioredis adapter processes queued and delayed jobs end to end", async () => {
    const context: Context = {
      calls: [],
    };
    const prefix = createRedisTestPrefix();
    const audit = job.withContext<Context>()("audit", {
      input: v.object({
        value: v.string(),
      }),
      handler: async ({ input, ctx }) => {
        ctx.calls.push(input.value);
      },
    });

    const flowli = defineJobs.withContext<Context>()({
      jobs: { audit },
      driver: ioredisDriver({
        client: ioredisClient!,
        prefix,
      }),
      context,
    });

    const runner = createRunner({
      flowli,
      leaseMs: 5_000,
      maxJobsPerTick: 10,
    });

    await flowli.audit.enqueue({ value: "queued" });
    await flowli.audit.delay(1, { value: "delayed" });

    expect(await runner.runOnce()).toBe(2);
    expect([...context.calls].sort()).toEqual(["delayed", "queued"]);
  });

  test("node-redis adapter registers deterministic schedules", async () => {
    const prefix = createRedisTestPrefix();
    const flowli = defineJobs({
      jobs: ({ job }) => ({
        audit: job("audit", {
          input: v.object({
            value: v.string(),
          }),
          handler: async () => undefined,
        }),
      }),
      context: {},
      driver: redisDriver({
        client: nodeRedisClient!,
        prefix,
      }),
    });

    const first = await flowli.audit.schedule({
      cron: "*/5 * * * *",
      input: {
        value: "scheduled",
      },
    });
    const second = await flowli.audit.schedule({
      cron: "*/5 * * * *",
      input: {
        value: "scheduled",
      },
    });

    expect(first.key).toBe(second.key);
  });
});
