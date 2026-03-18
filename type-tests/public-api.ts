import * as v from "valibot";
import { z } from "zod";
import type { HonoFlowliVariables } from "../src/hono.js";
import { defineJobs, job } from "../src/index.js";
import { nextAction, nextRoute } from "../src/next.js";

type Equal<Left, Right> =
  (<TValue>() => TValue extends Left ? 1 : 2) extends <
    TValue,
  >() => TValue extends Right ? 1 : 2
    ? true
    : false;
type Expect<TValue extends true> = TValue;

type AppContext = {
  db: {
    insert(table: string): {
      values(value: unknown): Promise<void>;
    };
  };
  logger: {
    info(value: unknown): void;
  };
};

const flowli = defineJobs({
  context: async () =>
    ({
      db: {
        insert(_table: string) {
          return {
            async values(_value: unknown) {
              return undefined;
            },
          };
        },
      },
      logger: {
        info(_value: unknown) {},
      },
    }) satisfies AppContext,
  jobs: ({ job }) => ({
    valibotJob: job("valibot_job", {
      input: v.object({
        id: v.string(),
      }),
      meta: v.object({
        requestId: v.string(),
      }),
      handler: async ({ input, ctx, meta }) => {
        await ctx.db.insert("audit").values(input);
        ctx.logger.info(meta?.requestId);
        return input.id;
      },
    }),
    zodJob: job("zod_job", {
      input: z.object({
        count: z.number(),
      }),
      handler: async ({ input, ctx }) => {
        ctx.logger.info(input.count);
        return input.count;
      },
    }),
  }),
});
const runtimeCheck = flowli;
void runtimeCheck;

void flowli.valibotJob.run(
  { id: "todo_1" },
  {
    meta: {
      requestId: "req_1",
    },
  },
);
void flowli.valibotJob.enqueue(
  { id: "todo_1" },
  {
    meta: {
      requestId: "req_1",
    },
  },
);
void flowli.zodJob.delay("5m", { count: 1 });
void flowli.zodJob.schedule({
  cron: "0 * * * *",
  input: {
    count: 1,
  },
});

type _honoVariables = Expect<
  Equal<HonoFlowliVariables<typeof flowli>, { flowli: typeof flowli }>
>;

const nextGet = nextRoute(flowli, async ({ flowli, params, request }) => {
  request.method satisfies string;
  params?.id satisfies string | readonly string[] | undefined;
  return Response.json({
    value: await flowli.valibotJob.run(
      { id: typeof params?.id === "string" ? params.id : "fallback" },
      {
        meta: {
          requestId: "req_2",
        },
      },
    ),
  });
});

void nextGet(new Request("https://flowli.dev"), {
  params: Promise.resolve({ id: "todo_2" }),
});

const createTodoAction = nextAction(
  flowli,
  async ({ flowli }, formData: FormData) => {
    const count = Number(formData.get("count") ?? "0");
    return flowli.zodJob.run({ count });
  },
);

void createTodoAction(new FormData());

const sharedJobs = {
  sharedJob: job.withContext<AppContext>()("shared_job", {
    input: v.object({
      id: v.string(),
    }),
    handler: async ({ input, ctx }) => {
      await ctx.db.insert("audit").values(input);
      return input.id;
    },
  }),
};

const runtimeFromSharedJobs = defineJobs.withContext<AppContext>()({
  jobs: sharedJobs,
  context: {
    db: {
      insert(_table: string) {
        return {
          async values(_value: unknown) {
            return undefined;
          },
        };
      },
    },
    logger: {
      info(_value: unknown) {},
    },
  },
});

void runtimeFromSharedJobs.sharedJob.run({ id: "ok" });

// @ts-expect-error string is required
void flowli.valibotJob.run({ id: 1 });

// @ts-expect-error requestId is required
void flowli.valibotJob.run({ id: "todo_1" }, { meta: {} });

// @ts-expect-error count must be a number
void flowli.zodJob.run({ count: "1" });

const jobsNeedingDb = {
  dbJob: job.withContext<{ db: { query(sql: string): Promise<void> } }>()(
    "db_job",
    {
      input: v.object({
        id: v.string(),
      }),
      handler: async ({ ctx }) => {
        await ctx.db.query("select 1");
      },
    },
  ),
};

defineJobs.withContext<{ db: { query(sql: string): Promise<void> } }>()({
  jobs: jobsNeedingDb,
  context: {
    db: {
      async query(_sql: string) {
        return undefined;
      },
    },
  },
});

defineJobs.withContext<{ db: { query(sql: string): Promise<void> } }>()({
  jobs: jobsNeedingDb,
  context: {
    // @ts-expect-error runtime context must satisfy predeclared job requirements
    logger: {
      info(_value: unknown) {},
    },
  },
});
