import { createHash, randomUUID } from "node:crypto";

import { FlowliSchedulingError } from "../core/errors.js";

type CronField = ReadonlySet<number>;

interface ParsedCron {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

const FIELD_RANGES = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
] as const;

export function validateCron(cron: string): void {
  parseCron(cron);
}

export function getNextCronRun(cron: string, from: number): number {
  const parsed = parseCron(cron);
  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let offset = 0; offset < 366 * 24 * 60; offset += 1) {
    if (
      parsed.minute.has(candidate.getUTCMinutes()) &&
      parsed.hour.has(candidate.getUTCHours()) &&
      parsed.dayOfMonth.has(candidate.getUTCDate()) &&
      parsed.month.has(candidate.getUTCMonth() + 1) &&
      parsed.dayOfWeek.has(candidate.getUTCDay())
    ) {
      return candidate.getTime();
    }

    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new FlowliSchedulingError(
    `Unable to resolve next UTC execution time for cron "${cron}".`,
  );
}

export function deriveScheduleKey(
  name: string,
  cron: string,
  input: unknown,
): string {
  const hash = createHash("sha256");
  hash.update(
    stableStringify({
      name,
      cron,
      input,
    }),
  );
  return `schedule_${hash.digest("hex").slice(0, 16)}`;
}

export function createJobId(): string {
  return randomUUID();
}

export function createLeaseToken(): string {
  return randomUUID();
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function parseCron(cron: string): ParsedCron {
  const parts = cron.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new FlowliSchedulingError(
      `Invalid cron "${cron}". Expected exactly five UTC fields.`,
    );
  }

  return {
    minute: parseField(parts[0]!, FIELD_RANGES[0].min, FIELD_RANGES[0].max),
    hour: parseField(parts[1]!, FIELD_RANGES[1].min, FIELD_RANGES[1].max),
    dayOfMonth: parseField(parts[2]!, FIELD_RANGES[2].min, FIELD_RANGES[2].max),
    month: parseField(parts[3]!, FIELD_RANGES[3].min, FIELD_RANGES[3].max),
    dayOfWeek: parseField(parts[4]!, FIELD_RANGES[4].min, FIELD_RANGES[4].max),
  };
}

function parseField(field: string, min: number, max: number): CronField {
  if (field === "*") {
    return createRange(min, max);
  }

  const values = new Set<number>();

  for (const segment of field.split(",")) {
    if (/^\d+$/.test(segment)) {
      const value = Number(segment);
      assertRange(value, min, max, field);
      values.add(value);
      continue;
    }

    const stepMatch = /^\*\/(\d+)$/.exec(segment);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      if (step <= 0) {
        throw new FlowliSchedulingError(`Invalid cron step "${segment}".`);
      }
      for (let value = min; value <= max; value += step) {
        values.add(value);
      }
      continue;
    }

    const rangeMatch = /^(\d+)-(\d+)$/.exec(segment);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      assertRange(start, min, max, field);
      assertRange(end, min, max, field);
      if (start > end) {
        throw new FlowliSchedulingError(`Invalid cron range "${segment}".`);
      }
      for (let value = start; value <= end; value += 1) {
        values.add(value);
      }
      continue;
    }

    throw new FlowliSchedulingError(`Unsupported cron field "${segment}".`);
  }

  return values;
}

function createRange(min: number, max: number): CronField {
  const values = new Set<number>();
  for (let value = min; value <= max; value += 1) {
    values.add(value);
  }
  return values;
}

function assertRange(
  value: number,
  min: number,
  max: number,
  field: string,
): void {
  if (value < min || value > max) {
    throw new FlowliSchedulingError(
      `Value ${value} is out of range for cron field "${field}".`,
    );
  }
}
