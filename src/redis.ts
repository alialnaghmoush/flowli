/**
 * The `flowli/redis` entrypoint provides the node-redis-backed driver adapter.
 */
export {
  type NodeRedisLikeClient,
  type RedisDriverOptions,
  redisDriver,
} from "./drivers/redis.js";
