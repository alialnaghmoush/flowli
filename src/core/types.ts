export interface StandardSchemaIssue {
  message: string;
  path?: ReadonlyArray<unknown>;
}

export interface StandardSchemaSuccess<TValue> {
  readonly value: TValue;
}

export interface StandardSchemaFailure {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
}

export type StandardSchemaResult<TValue> =
  | StandardSchemaSuccess<TValue>
  | StandardSchemaFailure;

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: number;
    readonly vendor?: string;
    readonly validate: (...args: any[]) => unknown | Promise<unknown>;
    readonly types?:
      | {
          readonly input: Input;
          readonly output: Output;
        }
      | undefined;
  };
}

export type InferInput<TSchema extends StandardSchemaV1<any, any>> =
  TSchema extends StandardSchemaV1<infer TInput, any> ? TInput : never;

export type InferOutput<TSchema extends StandardSchemaV1<any, any>> =
  TSchema extends StandardSchemaV1<any, infer TOutput> ? TOutput : never;

export interface FlowliContextRecord {
  readonly [key: PropertyKey]: unknown;
}

export type FlowliContextResolver<TContext extends FlowliContextRecord> =
  | TContext
  | (() => TContext | Promise<TContext>);

export type ResolveContext<TResolver> = TResolver extends () => infer TResult
  ? Awaited<TResult>
  : TResolver extends FlowliContextRecord
    ? TResolver
    : never;

export interface JobDefaults {
  readonly maxAttempts?: number;
  readonly backoff?: BackoffOptions;
}

export interface BackoffJitterOptions {
  readonly minRatio: number;
  readonly maxRatio: number;
}

export interface BackoffOptions {
  readonly type: "fixed" | "exponential";
  readonly delayMs: number;
  readonly maxDelayMs?: number;
  readonly jitter?: boolean | BackoffJitterOptions;
}

export interface FlowliInvocationOptions<TMeta> {
  readonly meta?: TMeta;
}

export interface PersistedInvocationOptions<TMeta>
  extends FlowliInvocationOptions<TMeta>,
    JobDefaults {}

export interface ScheduleInvocation<TInput, TMeta> {
  readonly key?: string;
  readonly cron: string;
  readonly input: TInput;
  readonly meta?: TMeta;
}

export type DelayValue = number | `${number}${"ms" | "s" | "m" | "h" | "d"}`;

export interface JobReceipt {
  readonly id: string;
  readonly name: string;
  readonly state: JobState;
  readonly scheduledFor: number;
  readonly attemptsMade: number;
}

export interface ScheduleReceipt {
  readonly key: string;
  readonly name: string;
  readonly cron: string;
  readonly nextRunAt: number;
}

export type JobState =
  | "queued"
  | "active"
  | "completed"
  | "failed"
  | "scheduled";

export interface JobHandlerArgs<TInput, TContext, TMeta> {
  readonly input: TInput;
  readonly ctx: TContext;
  readonly meta: TMeta | undefined;
}

export interface JobDefinition<
  TInputSchema extends StandardSchemaV1<any, any>,
  TMetaSchema extends StandardSchemaV1<any, any> | undefined,
  TContext extends FlowliContextRecord,
  TResult,
> {
  readonly __flowli: "job";
  readonly name: string;
  readonly input: TInputSchema;
  readonly meta?: TMetaSchema;
  readonly handler: (
    args: JobHandlerArgs<
      InferOutput<TInputSchema>,
      TContext,
      TMetaSchema extends StandardSchemaV1<any, any>
        ? InferOutput<TMetaSchema>
        : undefined
    >,
  ) => TResult | Promise<TResult>;
  readonly defaults?: JobDefaults;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

export interface JobOptions<
  TInputSchema extends StandardSchemaV1<any, any>,
  TMetaSchema extends StandardSchemaV1<any, any> | undefined,
  TContext extends FlowliContextRecord,
  TResult,
> {
  readonly input: TInputSchema;
  readonly meta?: TMetaSchema;
  readonly handler: JobDefinition<
    TInputSchema,
    TMetaSchema,
    TContext,
    TResult
  >["handler"];
  readonly defaults?: JobDefaults;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

export type AnyJobDefinition = JobDefinition<
  StandardSchemaV1<any, any>,
  StandardSchemaV1<any, any> | undefined,
  any,
  unknown
>;

export type JobsRecord = {
  readonly [key: string]: AnyJobDefinition;
};

export type JobInput<TJob extends AnyJobDefinition> = InferOutput<
  TJob["input"]
>;

export type JobMeta<TJob extends AnyJobDefinition> =
  NonNullable<TJob["meta"]> extends StandardSchemaV1<any, any>
    ? InferOutput<NonNullable<TJob["meta"]>>
    : undefined;

export type JobResult<TJob extends AnyJobDefinition> = Awaited<
  ReturnType<TJob["handler"]>
>;

export interface FlowliDriver {
  readonly kind: string;
  enqueue(record: PersistedJobRecord): Promise<JobReceipt>;
  registerSchedule(record: ScheduleRecord): Promise<ScheduleReceipt>;
  recoverExpiredLeases(now: number): Promise<number>;
  acquireNextReady(
    now: number,
    leaseMs: number,
  ): Promise<AcquiredJobRecord | null>;
  renewLease(jobId: string, token: string, leaseMs: number): Promise<boolean>;
  markCompleted(acquired: AcquiredJobRecord, finishedAt: number): Promise<void>;
  markFailed(
    acquired: AcquiredJobRecord,
    finishedAt: number,
    error: PersistedJobError,
  ): Promise<MarkFailedResult>;
  materializeDueSchedules(now: number, leaseMs: number): Promise<number>;
}

export interface DefineJobsOptions<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
> {
  readonly jobs: TJobs;
  readonly context: FlowliContextResolver<TContext>;
  readonly driver?: FlowliDriver;
  readonly defaults?: JobDefaults;
}

export interface DefineJobsBuilder<TContext extends FlowliContextRecord> {
  readonly job: <
    TInputSchema extends StandardSchemaV1<any, any>,
    TMetaSchema extends StandardSchemaV1<any, any> | undefined,
    TResult,
  >(
    name: string,
    options: JobOptions<TInputSchema, TMetaSchema, TContext, TResult>,
  ) => JobDefinition<TInputSchema, TMetaSchema, TContext, TResult>;
}

export interface DefineJobsFactoryOptions<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
> {
  readonly jobs: (builder: DefineJobsBuilder<TContext>) => TJobs;
  readonly context: FlowliContextResolver<TContext>;
  readonly driver?: FlowliDriver;
  readonly defaults?: JobDefaults;
}

export type EnsureJobContexts<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
> = {
  readonly [TKey in keyof TJobs]: TJobs[TKey] extends JobDefinition<
    StandardSchemaV1<any, any>,
    StandardSchemaV1<any, any> | undefined,
    infer TJobContext,
    unknown
  >
    ? TContext extends TJobContext
      ? TJobs[TKey]
      : never
    : never;
};

export interface FlowliJobSurface<TJob extends AnyJobDefinition> {
  run(
    input: JobInput<TJob>,
    options?: FlowliInvocationOptions<JobMeta<TJob>>,
  ): Promise<JobResult<TJob>>;
  enqueue(
    input: JobInput<TJob>,
    options?: PersistedInvocationOptions<JobMeta<TJob>>,
  ): Promise<JobReceipt>;
  delay(
    delay: DelayValue,
    input: JobInput<TJob>,
    options?: PersistedInvocationOptions<JobMeta<TJob>>,
  ): Promise<JobReceipt>;
  schedule(
    invocation: ScheduleInvocation<JobInput<TJob>, JobMeta<TJob>>,
  ): Promise<ScheduleReceipt>;
}

export type FlowliRuntime<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
> = {
  readonly [TKey in keyof TJobs]: FlowliJobSurface<TJobs[TKey]>;
} & {
  readonly [FLOWLI_RUNTIME_SYMBOL]: FlowliRuntimeInternals<TJobs, TContext>;
};

export interface FlowliRuntimeInternals<
  TJobs extends JobsRecord,
  TContext extends FlowliContextRecord,
> {
  readonly jobs: TJobs;
  readonly jobsByName: Map<string, AnyJobDefinition>;
  readonly context: () => Promise<TContext>;
  readonly driver?: FlowliDriver;
  readonly defaults: JobDefaults;
}

export const FLOWLI_RUNTIME_SYMBOL: unique symbol =
  Symbol.for("flowli.runtime");

export interface PersistedJobError {
  readonly code: string;
  readonly message: string;
}

export interface PersistedJobRecord {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly meta?: unknown;
  readonly state: JobState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly scheduledFor: number;
  readonly attemptsMade: number;
  readonly failureCount: number;
  readonly maxAttempts: number;
  readonly backoff?: BackoffOptions;
  readonly lastError?: PersistedJobError;
  readonly lastFailedAt?: number;
  readonly nextRetryAt?: number;
}

export interface MarkFailedResult {
  readonly state: "failed" | "retrying";
  readonly retryAt?: number;
}

export interface AcquiredJobRecord {
  readonly token: string;
  readonly record: PersistedJobRecord;
}

export interface ScheduleRecord {
  readonly key: string;
  readonly name: string;
  readonly cron: string;
  readonly input: unknown;
  readonly meta?: unknown;
  readonly maxAttempts: number;
  readonly backoff?: BackoffOptions;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly nextRunAt: number;
}
