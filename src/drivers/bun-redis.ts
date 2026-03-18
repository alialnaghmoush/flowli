import type { FlowliDriver } from "../core/types.js";
import { createRedisDriver, type RedisCommandAdapter } from "./shared.js";

export interface BunRedisLikeClient {
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
    options?: { limit?: { offset: number; count: number } },
  ): Promise<string[]>;
}

export interface BunRedisDriverOptions {
  readonly client: BunRedisLikeClient;
  readonly prefix?: string;
}

export function bunRedisDriver(options: BunRedisDriverOptions): FlowliDriver {
  return createRedisDriver({
    kind: "bun-redis",
    ...(options.prefix ? { prefix: options.prefix } : {}),
    commands: createBunRedisAdapter(options.client),
  });
}

export function createBunRedisAdapter(
  client: BunRedisLikeClient,
): RedisCommandAdapter {
  return {
    get: (key) => client.get(key),
    set: (key, value, options) =>
      client.set(key, value, {
        ...(options?.nx ? { nx: options.nx } : {}),
        ...(options?.px !== undefined ? { px: options.px } : {}),
      }),
    del: (key) => client.del(key),
    zadd: (key, score, member) => client.zadd(key, score, member),
    zrem: (key, member) => client.zrem(key, member),
    zrangebyscore: (key, min, max, limit) =>
      client.zrangebyscore(key, min, max, limit ? { limit } : undefined),
  };
}
