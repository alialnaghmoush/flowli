export interface FlowliRedisKeyOptions {
  readonly prefix?: string;
}

export interface FlowliRedisKeys {
  readonly job: (id: string) => string;
  readonly pending: string;
  readonly active: string;
  readonly completed: string;
  readonly failed: string;
  readonly schedule: (key: string) => string;
  readonly schedulesDue: string;
  readonly lease: (id: string) => string;
  readonly scheduleLease: (key: string) => string;
}

export function createRedisKeys(
  options: FlowliRedisKeyOptions = {},
): FlowliRedisKeys {
  const base = `flowli:${options.prefix ?? "default"}`;

  return {
    job: (id) => `${base}:job:${id}`,
    pending: `${base}:queue:pending`,
    active: `${base}:queue:active`,
    completed: `${base}:queue:completed`,
    failed: `${base}:queue:failed`,
    schedule: (key) => `${base}:schedule:${key}`,
    schedulesDue: `${base}:schedule:due`,
    lease: (id) => `${base}:lease:${id}`,
    scheduleLease: (key) => `${base}:lease:schedule:${key}`,
  };
}
