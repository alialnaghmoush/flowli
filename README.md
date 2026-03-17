# Flowli

Flowli is a typed jobs runtime for TypeScript.

Define jobs once. Run them anywhere.

## What It Does
- Define jobs with Standard Schema-compatible validators.
- Inject runtime-scoped `context` into handlers.
- Pass invocation-scoped `meta` into each strategy call.
- Run jobs inline with `run()` or persist them with `enqueue()`, `delay()`, and `schedule()`.
- Swap Redis client adapters without changing job definitions.
- Attach an existing runtime to Hono or an explicit async runner.

## Install

```bash
bun add flowli
```

Optional schema peers for typed validation:

```bash
bun add valibot zod
```

## Define A Job

```ts
import * as v from "valibot";
import { defineJobs, job } from "flowli";

export const flowli = defineJobs({
  context: {
    logger,
  },
  jobs: ({ job }) => ({
    createAuditLog: job("create_audit_log", {
      input: v.object({
        entityId: v.string(),
        action: v.string(),
      }),
      meta: v.object({
        requestId: v.string(),
      }),
      handler: async ({ input, ctx, meta }) => {
        ctx.logger.info({
          job: "create_audit_log",
          requestId: meta?.requestId,
          entityId: input.entityId,
          action: input.action,
        });
      },
    }),
  }),
});
```

This is the primary Flowli authoring path: runtime `context` is configured centrally in `defineJobs()`, and jobs are defined against that runtime.

## Run Without A Driver

`run()` does not require Redis, a driver, or a runner.

```ts
await flowli.createAuditLog.run(
  {
    entityId: "todo_1",
    action: "todo.created",
  },
  {
    meta: {
      requestId: "req_1",
    },
  },
);
```

## Persist Jobs

Use a driver subpath only when you want async persistence.

```ts
import { defineJobs } from "flowli";
import { ioredisDriver } from "flowli/ioredis";

export const flowli = defineJobs({
  jobs: { createAuditLog },
  driver: ioredisDriver({
    client: redis,
    prefix: "app",
  }),
  context: async () => ({
    logger,
  }),
});

await flowli.createAuditLog.enqueue({
  entityId: "todo_1",
  action: "todo.created",
});

await flowli.createAuditLog.delay("5m", {
  entityId: "todo_1",
  action: "todo.reminder",
});

await flowli.createAuditLog.schedule({
  cron: "0 * * * *",
  input: {
    entityId: "todo_1",
    action: "todo.summary",
  },
});
```

## Sharing Predeclared Jobs

If you want reusable job objects outside the runtime declaration, you can still predeclare them and attach them later. This is a secondary path for shared job modules.

```ts
import * as v from "valibot";
import { defineJobs, job } from "flowli";

type AppContext = {
  logger: {
    info(payload: unknown): void;
  };
};

export const createAuditLog = job.withContext<AppContext>()(
  "create_audit_log",
  {
    input: v.object({
      entityId: v.string(),
    }),
    handler: async ({ input, ctx }) => {
      ctx.logger.info(input.entityId);
    },
  },
);

export const flowli = defineJobs.withContext<AppContext>()({
  jobs: { createAuditLog },
  context: {
    logger,
  },
});
```

When you use predeclared jobs, bind them through `defineJobs.withContext<TContext>()` so Flowli can check at compile time that the runtime `context` satisfies the job's declared `ctx` requirements.

## Context Vs Meta

Use `context` for runtime-scoped dependencies:

- `db`
- `logger`
- `mailer`
- `schema`
- `config`

Use `meta` for invocation-scoped values:

- `requestId`
- `actorId`
- `locale`
- `traceId`
- `tenantId`

## Runner

`createRunner()` consumes an existing configured Flowli runtime. It does not re-register jobs or rebuild context.

```ts
import { createRunner } from "flowli/runner";

const runner = createRunner({
  flowli,
  concurrency: 5,
  pollIntervalMs: 1_000,
  leaseMs: 30_000,
});

await runner.runOnce();
await runner.start();
await runner.stop();
```

## Hono

```ts
import { honoJobs } from "flowli/hono";

app.use("*", honoJobs(flowli));
```

## Async Semantics

Flowli's persisted execution is:

- at-least-once
- lease-based
- retry-capable
- sensitive to handler idempotency

Job handlers should be safe to run more than once.

## Exports

- `flowli`
- `flowli/ioredis`
- `flowli/redis`
- `flowli/bun-redis`
- `flowli/hono`
- `flowli/runner`
