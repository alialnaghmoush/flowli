import type {
  AnyJobDefinition,
  FlowliContextRecord,
  JobMeta,
  JobResult,
} from "../core/types.js";

export async function invokeHandler<
  TJob extends AnyJobDefinition,
  TContext extends FlowliContextRecord,
>(
  job: TJob,
  input: unknown,
  context: TContext,
  meta: JobMeta<TJob>,
): Promise<JobResult<TJob>> {
  return (await job.handler({
    input: input as never,
    ctx: context as never,
    meta,
  })) as JobResult<TJob>;
}
