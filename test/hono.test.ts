import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { honoJobs } from "../src/hono.js";
import { defineJobs } from "../src/index.js";

describe("hono integration", () => {
  test("honoJobs attaches an existing runtime", async () => {
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
    const assigned = new Map<string, unknown>();
    const middleware = honoJobs(flowli);

    await middleware(
      {
        set(key, value) {
          assigned.set(key, value);
        },
      },
      async () => undefined,
    );

    expect(assigned.get("flowli")).toBe(flowli);
  });
});
