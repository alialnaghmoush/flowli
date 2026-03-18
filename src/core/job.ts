import type {
  FlowliContextRecord,
  JobDefinition,
  JobOptions,
  StandardSchemaV1,
} from "./types.js";

/** A job factory already bound to a specific Flowli context type. */
type JobFactory = {
  <
    TInputSchema extends StandardSchemaV1<any, any>,
    TMetaSchema extends StandardSchemaV1<any, any> | undefined,
    TResult,
  >(
    name: string,
    options: JobOptions<
      TInputSchema,
      TMetaSchema,
      FlowliContextRecord,
      TResult
    >,
  ): JobDefinition<TInputSchema, TMetaSchema, FlowliContextRecord, TResult>;
  withContext<TContext extends FlowliContextRecord>(): <
    TInputSchema extends StandardSchemaV1<any, any>,
    TMetaSchema extends StandardSchemaV1<any, any> | undefined,
    TResult,
  >(
    name: string,
    options: JobOptions<TInputSchema, TMetaSchema, TContext, TResult>,
  ) => JobDefinition<TInputSchema, TMetaSchema, TContext, TResult>;
};

/** The typed factory signature returned when a runtime binds `ctx` shape. */
export type ContextualJobFactory<TContext extends FlowliContextRecord> = <
  TInputSchema extends StandardSchemaV1<any, any>,
  TMetaSchema extends StandardSchemaV1<any, any> | undefined,
  TResult,
>(
  name: string,
  options: JobOptions<TInputSchema, TMetaSchema, TContext, TResult>,
) => JobDefinition<TInputSchema, TMetaSchema, TContext, TResult>;

function createJob<
  TContext extends FlowliContextRecord,
  TInputSchema extends StandardSchemaV1<any, any>,
  TMetaSchema extends StandardSchemaV1<any, any> | undefined,
  TResult,
>(
  name: string,
  options: JobOptions<TInputSchema, TMetaSchema, TContext, TResult>,
): JobDefinition<TInputSchema, TMetaSchema, TContext, TResult> {
  return {
    __flowli: "job",
    name,
    input: options.input,
    handler: options.handler,
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.defaults ? { defaults: options.defaults } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
  };
}

/** Defines a Flowli job with typed input, optional meta, and a handler. */
export const job: JobFactory = Object.assign(createJob, {
  withContext<TContext extends FlowliContextRecord>() {
    return <
      TInputSchema extends StandardSchemaV1<any, any>,
      TMetaSchema extends StandardSchemaV1<any, any> | undefined,
      TResult,
    >(
      name: string,
      options: JobOptions<TInputSchema, TMetaSchema, TContext, TResult>,
    ) => createJob(name, options);
  },
});

/** Creates a contextual `job()` factory for runtime-first authoring flows. */
export function createContextualJobFactory<
  TContext extends FlowliContextRecord,
>(): ContextualJobFactory<TContext> {
  return job.withContext<TContext>();
}
