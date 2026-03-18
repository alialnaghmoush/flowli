import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("packaging", () => {
  test("root build stays isolated from drivers, next, hono, and runner", async () => {
    execFileSync("bun", ["run", "build"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    const distRoot = join(process.cwd(), "dist");
    const rootFile = readFileSync(join(distRoot, "index.js"), "utf8");

    expect(rootFile.includes("./ioredis.js")).toBe(false);
    expect(rootFile.includes("./redis.js")).toBe(false);
    expect(rootFile.includes("./bun-redis.js")).toBe(false);
    expect(rootFile.includes("./next.js")).toBe(false);
    expect(rootFile.includes("./hono.js")).toBe(false);
    expect(rootFile.includes("./runner.js")).toBe(false);

    for (const file of [
      "index.js",
      "ioredis.js",
      "redis.js",
      "bun-redis.js",
      "next.js",
      "hono.js",
      "runner.js",
    ]) {
      expect(existsSync(join(distRoot, file))).toBe(true);
    }
  });
});
