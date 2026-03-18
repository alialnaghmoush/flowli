import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { defineJobs } from "../src/index.js";
import { nextAction, nextRoute } from "../src/next.js";

describe("next integration", () => {
  test("nextRoute injects an existing runtime and resolves params", async () => {
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

    const GET = nextRoute(
      flowli,
      async ({ flowli: runtime, params, request }): Promise<Response> => {
        const value = await runtime.ping.run({
          value: `${request.method}:${params?.slug ?? "missing"}`,
        });

        return Response.json({ value });
      },
    );

    const response = await GET(
      new Request("https://flowli.dev", {
        method: "GET",
      }),
      {
        params: Promise.resolve({ slug: "hello" }),
      },
    );

    expect(await response.json()).toEqual({
      value: "GET:hello",
    });
  });

  test("nextAction injects an existing runtime", async () => {
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

    const action = nextAction(
      flowli,
      async ({ flowli: runtime }, formData: FormData): Promise<string> =>
        runtime.ping.run({
          value: String(formData.get("value") ?? ""),
        }),
    );

    const formData = new FormData();
    formData.set("value", "flowli");

    await expect(action(formData)).resolves.toBe("FLOWLI");
  });
});
