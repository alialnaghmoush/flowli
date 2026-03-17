import { createRedisDriver, type RedisCommandAdapter } from "./shared.js";

export interface NodeRedisLikeClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { NX?: boolean; PX?: number },
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  zAdd(
    key: string,
    members: ReadonlyArray<{ score: number; value: string }>,
  ): Promise<number>;
  zRem(key: string, member: string): Promise<number>;
  zRangeByScore(
    key: string,
    min: number,
    max: number,
    options?: { LIMIT?: { offset: number; count: number } },
  ): Promise<string[]>;
}

export interface RedisDriverOptions {
  readonly client: NodeRedisLikeClient;
  readonly prefix?: string;
}

export function redisDriver(options: RedisDriverOptions) {
  return createRedisDriver({
    kind: "redis",
    ...(options.prefix ? { prefix: options.prefix } : {}),
    commands: createNodeRedisAdapter(options.client),
  });
}

export function createNodeRedisAdapter(
  client: NodeRedisLikeClient,
): RedisCommandAdapter {
  return {
    get: (key) => client.get(key),
    set: (key, value, options) =>
      client
        .set(key, value, {
          ...(options?.nx ? { NX: options.nx } : {}),
          ...(options?.px !== undefined ? { PX: options.px } : {}),
        })
        .then((result) => (result === null ? null : "OK")),
    del: (key) => client.del(key),
    zadd: (key, score, member) => client.zAdd(key, [{ score, value: member }]),
    zrem: (key, member) => client.zRem(key, member),
    zrangebyscore: (key, min, max, limit) =>
      client.zRangeByScore(key, min, max, limit ? { LIMIT: limit } : undefined),
  };
}
