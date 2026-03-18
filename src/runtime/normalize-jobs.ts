import { FlowliDefinitionError } from "../core/errors.js";
import type { AnyJobDefinition, JobsRecord } from "../core/types.js";

export function normalizeJobs<TJobs extends JobsRecord>(
  jobs: TJobs,
): {
  readonly jobs: TJobs;
  readonly jobsByName: Map<string, AnyJobDefinition>;
} {
  if (Object.hasOwn(jobs, "inspect")) {
    throw new FlowliDefinitionError(
      'Job export name "inspect" is reserved by the Flowli runtime.',
    );
  }

  const jobsByName = new Map<string, AnyJobDefinition>();

  for (const [exportName, definition] of Object.entries(jobs)) {
    if (!definition || definition.__flowli !== "job") {
      throw new FlowliDefinitionError(
        `Expected "${exportName}" to be a Flowli job definition.`,
      );
    }

    if (jobsByName.has(definition.name)) {
      throw new FlowliDefinitionError(
        `Duplicate job name "${definition.name}" found in registry.`,
      );
    }

    jobsByName.set(definition.name, definition);
  }

  return { jobs, jobsByName };
}
