import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, test } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "chendoc-db-client-"));
const secret = "d".repeat(32);
process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = join(dir, "client.sqlite");
process.env.JWT_SECRET = secret;
process.env.CONFIG_ENCRYPTION_KEY = secret;
process.env.RSA_PRIVATE_KEY_ENCRYPTION_KEY = secret;
process.env.CHENDOC_DOCUMENT_ENCRYPTION_KEY = secret;

const { closeDatabase, dbGet } = await import("./client.js");
const { currentRequestTiming, enterRequestTiming } = await import("../utils/requestTiming.js");

afterAll(async () => {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe("database request timing", () => {
  test("counts synchronous SQLite get time", async () => {
    enterRequestTiming("sqlite-get");
    const row = await dbGet<{ id: number }>({
      get() {
        const startedAt = performance.now();
        while (performance.now() - startedAt < 2) {
          // Simulate synchronous SQLite work.
        }
        return { id: 1 };
      }
    });

    expect(row).toEqual({ id: 1 });
    expect(currentRequestTiming()?.dbMs).toBeGreaterThan(0);
  });
});
