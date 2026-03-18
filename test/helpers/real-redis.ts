import { randomUUID } from "node:crypto";

import type { IoredisLikeClient } from "../../src/drivers/ioredis.js";
import type { NodeRedisLikeClient } from "../../src/drivers/redis.js";

export interface RealIoredisClient extends IoredisLikeClient {
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
}

export interface RealNodeRedisClient extends NodeRedisLikeClient {
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
}

export function getRedisUrl(): string | null {
  return process.env.FLOWLI_REDIS_URL ?? null;
}

export function createRedisTestPrefix(): string {
  return `flowli-test-${randomUUID()}`;
}

export async function createRealIoredisClient(
  url: string,
): Promise<RealIoredisClient | null> {
  const moduleName = "ioredis";
  const module = await import(moduleName).catch(() => null);
  if (!module) {
    return null;
  }

  const Client = module.default;
  const client = new Client(url);
  await client.ping();
  return client;
}

export async function createRealNodeRedisClient(
  url: string,
): Promise<RealNodeRedisClient | null> {
  const moduleName = "redis";
  const module = await import(moduleName).catch(() => null);
  if (!module) {
    return null;
  }

  const client = module.createClient({
    url,
  });
  await client.connect();
  await client.ping();
  return client;
}
