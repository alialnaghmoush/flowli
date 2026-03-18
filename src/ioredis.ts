/**
 * The `flowli/ioredis` entrypoint provides the ioredis-backed driver adapter.
 */
export {
  type IoredisDriverOptions,
  type IoredisLikeClient,
  ioredisDriver,
} from "./drivers/ioredis.js";
