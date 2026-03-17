import type {
  AnyJobDefinition,
  FlowliContextRecord,
  FlowliRuntimeInternals,
  JobDefaults,
  JobMeta,
  JobResult,
} from "../core/types.js";
import { invokeHandler } from "../runtime/invoke-handler.js";
import { validateWithSchema } from "../runtime/validate.js";

export async function runStrategy<
  TJob extends AnyJobDefinition,
  TContext extends FlowliContextRecord,
>(
  job: TJob,
  internals: FlowliRuntimeInternals<Record<string, TJob>, TContext>,
  _defaults: JobDefaults,
  input: unknown,
  meta: JobMeta<TJob> | undefined,
): Promise<JobResult<TJob>> {
  const validatedInput = await validateWithSchema(
    job.input,
    input,
    `${job.name} input`,
  );
  const validatedMeta = job.meta
    ? await validateWithSchema(job.meta, meta, `${job.name} meta`)
    : undefined;
  const context = await internals.context();

  return invokeHandler(
    job,
    validatedInput,
    context,
    validatedMeta as JobMeta<TJob>,
  );
}
