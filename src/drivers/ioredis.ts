import type { FlowliDriver } from "../core/types.js";
import { createRedisDriver, type RedisCommandAdapter } from "./shared.js";

/** The subset of an ioredis client Flowli requires. */
export interface IoredisLikeClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    modeOrOptions?: "PX" | "NX" | undefined,
    ttlOrMode?: number | "NX" | "PX",
    maybeMode?: "NX" | "PX",
  ): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    limitToken?: "LIMIT",
    offset?: number,
    count?: number,
  ): Promise<string[]>;
}

/** Options for creating the `flowli/ioredis` driver. */
export interface IoredisDriverOptions {
  readonly client: IoredisLikeClient;
  readonly prefix?: string;
}

/** Creates a Flowli driver backed by an ioredis-compatible client. */
export function ioredisDriver(options: IoredisDriverOptions): FlowliDriver {
  return createRedisDriver({
    kind: "ioredis",
    ...(options.prefix ? { prefix: options.prefix } : {}),
    commands: createIoredisAdapter(options.client),
  });
}

/** Adapts ioredis commands to Flowli's shared Redis driver contract. */
export function createIoredisAdapter(
  client: IoredisLikeClient,
): RedisCommandAdapter {
  return {
    get: (key) => client.get(key),
    async set(key, value, options) {
      if (options?.nx && options?.px !== undefined) {
        return client.set(key, value, "PX", options.px, "NX");
      }
      if (options?.nx) {
        return client.set(key, value, "NX");
      }
      if (options?.px !== undefined) {
        return client.set(key, value, "PX", options.px);
      }
      return client.set(key, value);
    },
    del: (key) => client.del(key),
    zadd: (key, score, member) => client.zadd(key, score, member),
    zrem: (key, member) => client.zrem(key, member),
    zrangebyscore: (key, min, max, limit) =>
      limit
        ? client.zrangebyscore(
            key,
            min,
            max,
            "LIMIT",
            limit.offset,
            limit.count,
          )
        : client.zrangebyscore(key, min, max),
  };
}
