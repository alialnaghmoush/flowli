import { FlowliValidationError } from "../core/errors.js";
import type {
  InferOutput,
  StandardSchemaFailure,
  StandardSchemaV1,
} from "../core/types.js";

export async function validateWithSchema<
  TSchema extends StandardSchemaV1<any, any>,
>(
  schema: TSchema,
  value: unknown,
  label: string,
): Promise<InferOutput<TSchema>> {
  const result = (await schema["~standard"].validate(value)) as unknown;

  if (isFailure(result)) {
    const issueSummary = result.issues.map((issue) => issue.message).join(", ");
    throw new FlowliValidationError(
      `${label} validation failed: ${issueSummary || "unknown validation issue"}`,
      result.issues,
    );
  }

  return (result as { value: InferOutput<TSchema> }).value;
}

function isFailure(result: unknown): result is StandardSchemaFailure {
  return Boolean(
    result &&
      typeof result === "object" &&
      "issues" in result &&
      Array.isArray((result as { issues?: unknown }).issues),
  );
}
