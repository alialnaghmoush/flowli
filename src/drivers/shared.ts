import type {
  FlowliDriver,
  PersistedJobRecord,
  ScheduleRecord,
} from "../core/types.js";
import { decodeJson, encodeJson } from "../driver/encoding.js";
import { createRedisKeys, type FlowliRedisKeyOptions } from "../driver/keys.js";
import {
  createJobReceipt,
  createPersistedJobRecord,
  createScheduleReceipt,
} from "../driver/records.js";
import {
  createJobId,
  createLeaseToken,
  getNextCronRun,
} from "../driver/scheduling.js";

export interface RedisCommandAdapter {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { nx?: boolean; px?: number },
  ): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  zrangebyscore(
    key: string,
    min: number,
    max: number,
    limit?: { offset: number; count: number },
  ): Promise<string[]>;
}

export interface SharedRedisDriverOptions extends FlowliRedisKeyOptions {
  readonly kind: string;
  readonly commands: RedisCommandAdapter;
}

export function createRedisDriver(
  options: SharedRedisDriverOptions,
): FlowliDriver {
  const keys = createRedisKeys(
    options.prefix ? { prefix: options.prefix } : undefined,
  );
  const commands = options.commands;

  return {
    kind: options.kind,
    async enqueue(record) {
      await writeJob(record);
      await commands.zadd(keys.pending, record.scheduledFor, record.id);
      return createJobReceipt(record);
    },
    async registerSchedule(record) {
      await commands.set(keys.schedule(record.key), encodeJson(record));
      await commands.zadd(keys.schedulesDue, record.nextRunAt, record.key);
      return createScheduleReceipt(record);
    },
    async recoverExpiredLeases(now) {
      const activeJobIds = await commands.zrangebyscore(
        keys.active,
        Number.NEGATIVE_INFINITY,
        now,
        {
          offset: 0,
          count: 100,
        },
      );

      let recovered = 0;

      for (const jobId of activeJobIds) {
        const lease = await commands.get(keys.lease(jobId));
        if (lease) {
          continue;
        }

        const record = await readJob(jobId);
        if (!record) {
          await commands.zrem(keys.active, jobId);
          continue;
        }

        const recoveredRecord: PersistedJobRecord = {
          ...record,
          state: "queued",
          scheduledFor: now,
          updatedAt: now,
        };

        await writeJob(recoveredRecord);
        await commands.zrem(keys.active, jobId);
        await commands.zadd(keys.pending, now, jobId);
        recovered += 1;
      }

      return recovered;
    },
    async acquireNextReady(now, leaseMs) {
      const candidates = await commands.zrangebyscore(
        keys.pending,
        Number.NEGATIVE_INFINITY,
        now,
        {
          offset: 0,
          count: 25,
        },
      );

      for (const jobId of candidates) {
        const token = createLeaseToken();
        const locked = await commands.set(keys.lease(jobId), token, {
          nx: true,
          px: leaseMs,
        });

        if (!locked) {
          continue;
        }

        const removed = await commands.zrem(keys.pending, jobId);
        if (removed === 0) {
          await commands.del(keys.lease(jobId));
          continue;
        }

        const record = await readJob(jobId);
        if (!record) {
          await commands.del(keys.lease(jobId));
          continue;
        }

        const acquiredRecord: PersistedJobRecord = {
          ...record,
          state: "active",
          attemptsMade: record.attemptsMade + 1,
          updatedAt: now,
        };
        await writeJob(acquiredRecord);
        await commands.zadd(keys.active, now, jobId);

        return {
          token,
          record: acquiredRecord,
        };
      }

      return null;
    },
    async renewLease(jobId, token, leaseMs) {
      const current = await commands.get(keys.lease(jobId));
      if (current !== token) {
        return false;
      }
      const updated = await commands.set(keys.lease(jobId), token, {
        px: leaseMs,
      });
      return updated === "OK";
    },
    async markCompleted(acquired, finishedAt) {
      const completedRecord: PersistedJobRecord = {
        ...acquired.record,
        state: "completed",
        updatedAt: finishedAt,
      };
      await writeJob(completedRecord);
      await commands.zrem(keys.active, completedRecord.id);
      await commands.zadd(keys.completed, finishedAt, completedRecord.id);
      await commands.del(keys.lease(completedRecord.id));
    },
    async markFailed(acquired, finishedAt, error) {
      const shouldRetry =
        acquired.record.attemptsMade < acquired.record.maxAttempts;
      const retryAt = shouldRetry
        ? finishedAt + computeBackoff(acquired.record, finishedAt)
        : finishedAt;
      const nextRecord: PersistedJobRecord = {
        ...acquired.record,
        state: shouldRetry ? "queued" : "failed",
        scheduledFor: retryAt,
        updatedAt: finishedAt,
        lastError: error,
      };

      await writeJob(nextRecord);
      await commands.zrem(keys.active, nextRecord.id);

      if (shouldRetry) {
        await commands.zadd(keys.pending, retryAt, nextRecord.id);
      } else {
        await commands.zadd(keys.failed, finishedAt, nextRecord.id);
      }

      await commands.del(keys.lease(nextRecord.id));

      return shouldRetry ? "retrying" : "failed";
    },
    async materializeDueSchedules(now, leaseMs) {
      const dueKeys = await commands.zrangebyscore(
        keys.schedulesDue,
        Number.NEGATIVE_INFINITY,
        now,
        { offset: 0, count: 100 },
      );

      let created = 0;

      for (const scheduleKey of dueKeys) {
        const token = createLeaseToken();
        const locked = await commands.set(
          keys.scheduleLease(scheduleKey),
          token,
          {
            nx: true,
            px: leaseMs,
          },
        );
        if (!locked) {
          continue;
        }

        const schedule = await readSchedule(scheduleKey);
        if (!schedule) {
          await commands.zrem(keys.schedulesDue, scheduleKey);
          await commands.del(keys.scheduleLease(scheduleKey));
          continue;
        }

        if (schedule.nextRunAt > now) {
          await commands.del(keys.scheduleLease(scheduleKey));
          continue;
        }

        const jobRecord = createPersistedJobRecord({
          id: createJobId(),
          name: schedule.name,
          input: schedule.input,
          meta: schedule.meta,
          scheduledFor: now,
          maxAttempts: schedule.maxAttempts,
          ...(schedule.backoff ? { backoff: schedule.backoff } : {}),
          now,
        });

        await writeJob(jobRecord);
        await commands.zadd(keys.pending, now, jobRecord.id);
        created += 1;

        const nextRunAt = getNextCronRun(schedule.cron, now);
        const nextSchedule: ScheduleRecord = {
          ...schedule,
          nextRunAt,
          updatedAt: now,
        };
        await commands.set(
          keys.schedule(schedule.key),
          encodeJson(nextSchedule),
        );
        await commands.zrem(keys.schedulesDue, scheduleKey);
        await commands.zadd(keys.schedulesDue, nextRunAt, scheduleKey);
        await commands.del(keys.scheduleLease(scheduleKey));
      }

      return created;
    },
  };

  async function writeJob(record: PersistedJobRecord): Promise<void> {
    await commands.set(keys.job(record.id), encodeJson(record));
  }

  async function readJob(jobId: string): Promise<PersistedJobRecord | null> {
    return decodeJson<PersistedJobRecord>(await commands.get(keys.job(jobId)));
  }

  async function readSchedule(key: string): Promise<ScheduleRecord | null> {
    return decodeJson<ScheduleRecord>(await commands.get(keys.schedule(key)));
  }
}

function computeBackoff(
  record: PersistedJobRecord,
  finishedAt: number,
): number {
  void finishedAt;
  if (!record.backoff) {
    return 0;
  }

  if (record.backoff.type === "fixed") {
    return record.backoff.delayMs;
  }

  const exponent = Math.max(record.attemptsMade - 1, 0);
  return record.backoff.delayMs * Math.max(1, 2 ** exponent);
}
