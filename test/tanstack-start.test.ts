import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { defineJobs } from "../src/index.js";
import {
  type TanStackStartServerFnTools,
  tanstackStartRoute,
  tanstackStartServerFn,
} from "../src/tanstack-start.js";

describe("tanstack start integration", () => {
  test("tanstackStartRoute injects an existing runtime", async () => {
    const flowli = defineJobs({
      context: {},
      jobs: ({ job }) => ({
        ping: job("ping", {
          input: v.object({
            value: v.string(),
          }),
          handler: ({ input }) => input.value,
        }),
      }),
    });

    const GET = tanstackStartRoute(
      flowli,
      async ({ flowli: runtime, params, request, context }) => {
        const prefix = String(context.prefix ?? "route");
        const value = await runtime.ping.run({
          value: `${prefix}:${request.method}:${params.slug}`,
        });

        return Response.json({ value });
      },
    );

    const response = await GET({
      request: new Request("https://flowli.dev", {
        method: "GET",
      }),
      params: {
        slug: "hello",
      },
      context: {
        prefix: "start",
      },
    });

    expect(await response.json()).toEqual({
      value: "start:GET:hello",
    });
  });

  test("tanstackStartServerFn injects an existing runtime", async () => {
    const flowli = defineJobs({
      context: {},
      jobs: ({ job }) => ({
        ping: job("ping", {
          input: v.object({
            value: v.string(),
          }),
          handler: ({ input }) => input.value.toUpperCase(),
        }),
      }),
    });

    const saveValue = tanstackStartServerFn(
      flowli,
      async ({
        flowli: runtime,
        data,
      }: { data: { value: string } } & TanStackStartServerFnTools<
        typeof flowli
      >) =>
        runtime.ping.run({
          value: data.value,
        }),
    );

    await expect(
      saveValue({
        data: {
          value: "flowli",
        },
      }),
    ).resolves.toBe("FLOWLI");
  });
});
