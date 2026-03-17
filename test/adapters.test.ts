import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { bunRedisDriver } from "../src/bun-redis.js";
import { defineJobs, job } from "../src/index.js";
import { ioredisDriver } from "../src/ioredis.js";
import { redisDriver } from "../src/redis.js";
import { createMemoryRedisClients } from "./helpers/memory-redis.js";

type Context = {
  seen: string[];
};

const notifyJob = job.withContext<Context>()("notify", {
  input: v.object({
    userId: v.string(),
  }),
  handler: async ({ input, ctx }) => {
    ctx.seen.push(input.userId);
  },
});

describe("drivers", () => {
  test("the same job definition can enqueue across all adapters unchanged", async () => {
    const ioClients = createMemoryRedisClients();
    const redisClients = createMemoryRedisClients();
    const bunClients = createMemoryRedisClients();

    const ioFlowli = defineJobs.withContext<Context>()({
      jobs: { notifyJob },
      driver: ioredisDriver({
        client: ioClients.ioredis,
        prefix: "io",
      }),
      context: { seen: [] },
    });
    const nodeFlowli = defineJobs.withContext<Context>()({
      jobs: { notifyJob },
      driver: redisDriver({
        client: redisClients.redis,
        prefix: "node",
      }),
      context: { seen: [] },
    });
    const bunFlowli = defineJobs.withContext<Context>()({
      jobs: { notifyJob },
      driver: bunRedisDriver({
        client: bunClients.bun,
        prefix: "bun",
      }),
      context: { seen: [] },
    });

    await expect(
      ioFlowli.notifyJob.enqueue({ userId: "u1" }),
    ).resolves.toMatchObject({
      name: "notify",
      state: "queued",
    });
    await expect(
      nodeFlowli.notifyJob.delay("5m", { userId: "u2" }),
    ).resolves.toMatchObject({
      name: "notify",
      state: "queued",
    });
    await expect(
      bunFlowli.notifyJob.schedule({
        cron: "*/5 * * * *",
        input: { userId: "u3" },
      }),
    ).resolves.toMatchObject({
      name: "notify",
      cron: "*/5 * * * *",
    });
  });
});
