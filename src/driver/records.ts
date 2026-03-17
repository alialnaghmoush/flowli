import type {
  BackoffOptions,
  JobReceipt,
  PersistedJobError,
  PersistedJobRecord,
  ScheduleReceipt,
  ScheduleRecord,
} from "../core/types.js";

export function createPersistedJobRecord(options: {
  id: string;
  name: string;
  input: unknown;
  meta?: unknown;
  scheduledFor: number;
  maxAttempts: number;
  backoff?: BackoffOptions;
  now: number;
}): PersistedJobRecord {
  return {
    id: options.id,
    name: options.name,
    input: options.input,
    state: "queued",
    createdAt: options.now,
    updatedAt: options.now,
    scheduledFor: options.scheduledFor,
    attemptsMade: 0,
    maxAttempts: options.maxAttempts,
    ...(options.meta !== undefined ? { meta: options.meta } : {}),
    ...(options.backoff ? { backoff: options.backoff } : {}),
  };
}

export function createJobReceipt(record: PersistedJobRecord): JobReceipt {
  return {
    id: record.id,
    name: record.name,
    state: record.state,
    scheduledFor: record.scheduledFor,
    attemptsMade: record.attemptsMade,
  };
}

export function createScheduleRecord(options: {
  key: string;
  name: string;
  cron: string;
  input: unknown;
  meta?: unknown;
  maxAttempts: number;
  backoff?: BackoffOptions;
  nextRunAt: number;
  now: number;
}): ScheduleRecord {
  return {
    key: options.key,
    name: options.name,
    cron: options.cron,
    input: options.input,
    maxAttempts: options.maxAttempts,
    createdAt: options.now,
    updatedAt: options.now,
    nextRunAt: options.nextRunAt,
    ...(options.meta !== undefined ? { meta: options.meta } : {}),
    ...(options.backoff ? { backoff: options.backoff } : {}),
  };
}

export function createScheduleReceipt(record: ScheduleRecord): ScheduleReceipt {
  return {
    key: record.key,
    name: record.name,
    cron: record.cron,
    nextRunAt: record.nextRunAt,
  };
}

export function createPersistedJobError(error: unknown): PersistedJobError {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : "FLOWLI_HANDLER_ERROR";

    return {
      code,
      message: error.message,
    };
  }

  return {
    code: "FLOWLI_HANDLER_ERROR",
    message: typeof error === "string" ? error : "Unknown handler error",
  };
}
