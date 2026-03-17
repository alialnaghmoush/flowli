type StringEntry = {
  value: string;
  expiresAt?: number;
};

class MemoryRedisStore {
  private readonly strings = new Map<string, StringEntry>();
  private readonly zsets = new Map<string, Map<string, number>>();

  get(key: string): string | null {
    this.pruneExpiredKey(key);
    return this.strings.get(key)?.value ?? null;
  }

  set(
    key: string,
    value: string,
    options?: { nx?: boolean; px?: number },
  ): "OK" | null {
    this.pruneExpiredKey(key);
    if (options?.nx && this.strings.has(key)) {
      return null;
    }

    this.strings.set(key, {
      value,
      ...(options?.px !== undefined
        ? { expiresAt: Date.now() + options.px }
        : {}),
    });
    return "OK";
  }

  del(key: string): number {
    this.pruneExpiredKey(key);
    const removed = this.strings.delete(key);
    return removed ? 1 : 0;
  }

  zadd(key: string, score: number, member: string): number {
    const bucket = this.ensureZset(key);
    const sizeBefore = bucket.size;
    bucket.set(member, score);
    return bucket.size > sizeBefore ? 1 : 0;
  }

  zrem(key: string, member: string): number {
    const bucket = this.zsets.get(key);
    if (!bucket) {
      return 0;
    }

    return bucket.delete(member) ? 1 : 0;
  }

  zrangebyscore(
    key: string,
    min: number,
    max: number,
    limit?: { offset: number; count: number },
  ): string[] {
    const bucket = this.zsets.get(key);
    if (!bucket) {
      return [];
    }

    const members = [...bucket.entries()]
      .filter(([, score]) => score >= min && score <= max)
      .sort(
        (left, right) => left[1] - right[1] || left[0].localeCompare(right[0]),
      )
      .map(([member]) => member);

    if (!limit) {
      return members;
    }

    return members.slice(limit.offset, limit.offset + limit.count);
  }

  private ensureZset(key: string): Map<string, number> {
    const current = this.zsets.get(key);
    if (current) {
      return current;
    }

    const bucket = new Map<string, number>();
    this.zsets.set(key, bucket);
    return bucket;
  }

  private pruneExpiredKey(key: string): void {
    const entry = this.strings.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
    }
  }
}

export function createMemoryRedisClients() {
  const store = new MemoryRedisStore();

  return {
    ioredis: {
      get: async (key: string) => store.get(key),
      set: async (
        key: string,
        value: string,
        modeOrOptions?: "PX" | "NX",
        ttlOrMode?: number | "NX" | "PX",
        maybeMode?: "NX" | "PX",
      ) => {
        const options: { nx?: boolean; px?: number } = {};
        if (modeOrOptions === "NX") {
          options.nx = true;
        }
        if (modeOrOptions === "PX" && typeof ttlOrMode === "number") {
          options.px = ttlOrMode;
        }
        if (ttlOrMode === "NX" || maybeMode === "NX") {
          options.nx = true;
        }
        if (ttlOrMode === "PX" && typeof maybeMode === "number") {
          options.px = maybeMode;
        }
        return store.set(key, value, options);
      },
      del: async (key: string) => store.del(key),
      zadd: async (key: string, score: number, member: string) =>
        store.zadd(key, score, member),
      zrem: async (key: string, member: string) => store.zrem(key, member),
      zrangebyscore: async (
        key: string,
        min: number | string,
        max: number | string,
        limitToken?: "LIMIT",
        offset?: number,
        count?: number,
      ) =>
        store.zrangebyscore(
          key,
          typeof min === "string" ? Number(min) : min,
          typeof max === "string" ? Number(max) : max,
          limitToken === "LIMIT" && offset !== undefined && count !== undefined
            ? { offset, count }
            : undefined,
        ),
    },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (
        key: string,
        value: string,
        options?: { NX?: boolean; PX?: number },
      ) =>
        store.set(key, value, {
          ...(options?.NX ? { nx: options.NX } : {}),
          ...(options?.PX !== undefined ? { px: options.PX } : {}),
        }),
      del: async (key: string) => store.del(key),
      zAdd: async (
        key: string,
        members: ReadonlyArray<{ score: number; value: string }>,
      ) =>
        members.reduce(
          (count, entry) => count + store.zadd(key, entry.score, entry.value),
          0,
        ),
      zRem: async (key: string, member: string) => store.zrem(key, member),
      zRangeByScore: async (
        key: string,
        min: number,
        max: number,
        options?: { LIMIT?: { offset: number; count: number } },
      ) => store.zrangebyscore(key, min, max, options?.LIMIT),
    },
    bun: {
      get: async (key: string) => store.get(key),
      set: async (
        key: string,
        value: string,
        options?: { nx?: boolean; px?: number },
      ) => store.set(key, value, options),
      del: async (key: string) => store.del(key),
      zadd: async (key: string, score: number, member: string) =>
        store.zadd(key, score, member),
      zrem: async (key: string, member: string) => store.zrem(key, member),
      zrangebyscore: async (
        key: string,
        min: number,
        max: number,
        options?: { limit?: { offset: number; count: number } },
      ) => store.zrangebyscore(key, min, max, options?.limit),
    },
  };
}
