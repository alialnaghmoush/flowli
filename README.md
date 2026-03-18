# Flowli

**Typed jobs for modern TypeScript backends.**

Flowli is a jobs runtime with a code-first API, first-class execution strategies, runtime-scoped context injection, and pluggable Redis drivers.

Define jobs once. Run them anywhere.

## Why Flowli

Most job systems make one of these tradeoffs:

- great queues, weak TypeScript ergonomics
- strong typing, but framework lock-in
- easy background work, but awkward direct execution in app code and tests

Flowli is built around a different model:

- author jobs like application code, not infrastructure config
- keep `context` centralized in the runtime
- use the same job surface in route handlers, scripts, tests, and workers
- choose execution strategy per call: `run`, `enqueue`, `delay`, `schedule`
- swap Redis clients without rewriting job definitions

It is not a BullMQ clone. It is a typed runtime for background and deferred execution.

## What It Feels Like

```ts
// src/flowli/jobs/create-audit-log.ts
import * as v from "valibot";
import { job } from "flowli";

export const createAuditLog = job.withContext<{
  db: typeof db;
  schema: typeof schema;
  logger: typeof logger;
}>()("create_audit_log", {
  input: v.object({
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    message: v.string(),
  }),
  meta: v.object({
    requestId: v.string(),
    actorId: v.optional(v.string()),
  }),
  handler: async ({ input, ctx, meta }) => {
    await ctx.db.insert(ctx.schema.auditLogs).values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      message: input.message,
      requestId: meta?.requestId,
      actorId: meta?.actorId ?? null,
    });

    ctx.logger.info({
      job: "create_audit_log",
      requestId: meta?.requestId,
      entityId: input.entityId,
    });
  },
});
```

```ts
// src/flowli/jobs/send-notification-email.ts
import * as v from "valibot";
import { job } from "flowli";

export const sendNotificationEmail = job.withContext<{
  mailer: typeof mailer;
}>()("send_notification_email", {
  input: v.object({
    email: v.string(),
    subject: v.string(),
    message: v.string(),
  }),
  handler: async ({ input, ctx }) => {
    await ctx.mailer.send({
      to: input.email,
      subject: input.subject,
      text: input.message,
    });
  },
});
```

```ts
// src/flowli/jobs/index.ts
export * from "./create-audit-log";
export * from "./send-notification-email";
```

```ts
// src/flowli/index.ts
import { defineJobs } from "flowli";
import { ioredisDriver } from "flowli/ioredis";
import * as jobs from "./jobs";

export const flowli = defineJobs({
  driver: ioredisDriver({
    client: redis,
    prefix: "app",
  }),
  context: async () => ({
    db,
    schema,
    logger,
    mailer,
  }),
  jobs,
});
```

Then use it where the work happens:

```ts
await flowli.createAuditLog.run(
  {
    entityType: "invoice",
    entityId: "inv_123",
    action: "invoice.created",
    message: "Invoice created",
  },
  {
    meta: {
      requestId: "req_123",
      actorId: "user_123",
    },
  },
);

await flowli.sendNotificationEmail.enqueue({
  email: "sam@example.com",
  subject: "Flowli event received",
  message: "A new invoice was created.",
});

await flowli.sendNotificationEmail.delay("10m", {
  email: "sam@example.com",
  subject: "Delayed follow-up",
  message: "This is your delayed notification.",
});

await flowli.sendNotificationEmail.schedule({
  cron: "0 8 * * *",
  input: {
    email: "sam@example.com",
    subject: "Daily digest",
    message: "Here is your daily digest.",
  },
});
```

## The Core Idea

Flowli is built around four primitives:

1. `job()`
   Define one unit of work with typed `input`, optional typed `meta`, and a handler.
2. `defineJobs()`
   Bind jobs to a runtime `context`, optional driver, and shared defaults.
3. execution strategies
   Choose `run`, `enqueue`, `delay`, or `schedule` per invocation.
4. optional async runtime
   Attach `createRunner({ flowli })` only when you want persisted async processing.

## Primary Authoring Path

The canonical Flowli path is runtime-first:

```ts
// src/flowli/jobs/create-audit-log.ts
import * as v from "valibot";
import { job } from "flowli";

export const createAuditLog = job.withContext<{
  logger: typeof logger;
  db: typeof db;
}>()("create_audit_log", {
  input: v.object({
    entityId: v.string(),
    action: v.string(),
  }),
  meta: v.object({
    requestId: v.string(),
  }),
  handler: async ({ input, ctx, meta }) => {
    await ctx.db.insert("audit_logs").values({
      entityId: input.entityId,
      action: input.action,
      requestId: meta?.requestId,
    });

    ctx.logger.info({
      entityId: input.entityId,
      action: input.action,
    });
  },
});
```

```ts
// src/flowli/jobs/index.ts
export * from "./create-audit-log";
```

```ts
// src/flowli/index.ts
import { defineJobs } from "flowli";
import * as jobs from "./jobs";

export const flowli = defineJobs({
  context: {
    logger,
    db,
  },
  jobs,
});
```

This keeps the mental model clean:

- runtime `context` is defined in one place
- jobs are authored against that runtime
- handlers receive typed `ctx`
- app wiring stays separate from business logic

## `run()` Works Without Infrastructure

`run()` is intentionally independent of drivers, queues, leases, and runner state.

That makes Flowli useful in:

- route handlers
- CLI scripts
- local development
- unit tests
- synchronous side-effect flows

```ts
await flowli.createAuditLog.run(
  {
    entityId: "record_1",
    action: "record.created",
  },
  {
    meta: {
      requestId: "req_1",
    },
  },
);
```

## Rich Example

A realistic service can use both direct execution and background work from the same runtime:

```ts
// src/services/create-record.ts
import { flowli } from "../flowli";

export async function createRecord(input: {
  title: string;
  description?: string;
}) {
  const [record] = await db
    .insert(schema.records)
    .values({
      title: input.title,
      description: input.description ?? null,
    })
    .returning();

  await flowli.createAuditLog.run(
    {
      entityType: "record",
      entityId: String(record.id),
      action: "record.created",
      message: `Record "${record.title}" was created`,
    },
    {
      meta: {
        requestId: "req_123",
        actorId: "user_123",
      },
    },
  );

  await flowli.sendNotificationEmail.enqueue({
    email: "owner@example.com",
    subject: "Record created",
    message: `A new record named "${record.title}" is ready.`,
  });

  return record;
}
```

One job surface. Multiple execution modes. Same typing story.

## Context vs Meta

This separation is intentional and important.

Use `context` for runtime-scoped dependencies:

- `db`
- `schema`
- `logger`
- `mailer`
- `storage`
- `config`

Use `meta` for invocation-scoped values:

- `requestId`
- `actorId`
- `locale`
- `tenantId`
- `traceId`

In short:

- `context` is infrastructure and shared services
- `meta` is request or invocation data

## Async Execution

To persist jobs, add a driver:

```ts
// src/flowli/jobs/send-email.ts
import * as v from "valibot";
import { job } from "flowli";

export const sendEmail = job.withContext<{
  mailer: typeof mailer;
}>()("send_email", {
  input: v.object({
    email: v.string(),
    subject: v.string(),
  }),
  handler: async ({ input, ctx }) => {
    await ctx.mailer.send({
      to: input.email,
      subject: input.subject,
    });
  },
});
```

```ts
// src/flowli/jobs/index.ts
export * from "./send-email";
```

```ts
// src/flowli/index.ts
import { defineJobs } from "flowli";
import { ioredisDriver } from "flowli/ioredis";
import * as jobs from "./jobs";

export const flowli = defineJobs({
  driver: ioredisDriver({
    client: redis,
    prefix: "app",
  }),
  context: async () => ({
    db,
    logger,
    mailer,
  }),
  jobs,
});
```

Flowli supports:

- `flowli/ioredis`
- `flowli/redis`
- `flowli/bun-redis`

The job definitions stay the same. Only the driver changes.

## Runner

The runner is explicit and secondary by design.

Flowli is not a worker-first framework. The story stays:

- define jobs
- configure Flowli
- optionally attach a runner

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

`createRunner()` consumes an existing runtime. It does not recreate jobs or rebuild context.

## Async Semantics

Persisted execution in Flowli is:

- at-least-once
- lease-based
- retry-capable
- idempotency-sensitive

Handlers that run asynchronously should be safe to run more than once.

## Reusable Predeclared Jobs

If you want shareable job modules outside the runtime declaration, Flowli supports that too.

This is the advanced path:

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

When you use this path, Flowli checks at compile time that the runtime `context` satisfies the predeclared job requirements.

## Hono

Attach an existing runtime to Hono without creating a second abstraction:

```ts
import { honoJobs } from "flowli/hono";

app.use("*", honoJobs(flowli));
```

## Next.js

Use the same configured runtime in route handlers and server actions without rebuilding anything:

```ts
// app/api/audit/[entityId]/route.ts
import { nextAction, nextRoute } from "flowli/next";
import { flowli } from "@/src/flowli";

export const POST = nextRoute(
  flowli,
  async ({ request, flowli, params }) => {
    const body = await request.json();

    await flowli.createAuditLog.run(
      {
        entityType: body.entityType ?? "record",
        entityId: params?.entityId ?? body.entityId,
        action: body.action ?? "record.updated",
        message: "Audit event received from route handler",
      },
      {
        meta: {
          requestId: request.headers.get("x-request-id") ?? "unknown",
        },
      },
    );

    return Response.json({ ok: true });
  },
);
```

```ts
// app/actions/send-notification.ts
export const sendNotificationAction = nextAction(
  flowli,
  async ({ flowli }, formData: FormData) => {
    await flowli.sendNotificationEmail.enqueue({
      email: String(formData.get("email")),
      subject: String(formData.get("subject")),
      message: String(formData.get("message")),
    });
  },
);
```

`flowli/next` stays lightweight:

- no second runtime
- no hidden global registry
- no direct dependency on Next internals inside your jobs
- works with an already configured `flowli` instance

## Install

```bash
npm install flowli
```

```bash
pnpm add flowli
```

```bash
bun add flowli
```

Optional schema peers:

```bash
bun add valibot zod
```

Optional framework peers:

```bash
bun add next
```

## What Flowli Optimizes For

- small API surface
- explicit runtime wiring
- strong autocomplete
- clean context injection
- type-safe invocation surfaces
- tree-shakable subpath exports
- framework-agnostic core design

## Exports

- `flowli`
- `flowli/ioredis`
- `flowli/redis`
- `flowli/bun-redis`
- `flowli/next`
- `flowli/hono`
- `flowli/runner`

## Status

Flowli v1 currently includes:

- typed `job()` definitions
- runtime-first `defineJobs()`
- `run`, `enqueue`, `delay`, and `schedule`
- pluggable Redis drivers
- Next.js helpers
- explicit runner support
- Hono middleware
- npm and JSR publish configuration

If you want the shortest description:

**Flowli is a typed jobs runtime for TypeScript with first-class execution strategies and pluggable Redis drivers.**
