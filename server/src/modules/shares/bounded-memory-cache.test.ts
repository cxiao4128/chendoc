import { describe, expect, test, vi } from "vitest";
import { BoundedMemoryCache } from "./bounded-memory-cache.js";

describe("BoundedMemoryCache", () => {
  test("evicts least-recently-used entries to stay within the byte budget", () => {
    const cache = new BoundedMemoryCache<string, string>({
      maxEntries: 10,
      maxBytes: 10,
      ttlMs: 1_000,
      sizeOf: (value) => value.length
    });

    cache.set("first", "12345");
    cache.set("second", "6789");
    expect(cache.get("first")).toBe("12345");
    cache.set("third", "abcd");

    expect(cache.get("second")).toBeNull();
    expect(cache.get("first")).toBe("12345");
    expect(cache.get("third")).toBe("abcd");
  });

  test("does not retain one entry larger than the total byte budget", () => {
    const cache = new BoundedMemoryCache<string, string>({
      maxEntries: 10,
      maxBytes: 4,
      ttlMs: 1_000,
      sizeOf: (value) => value.length
    });

    expect(cache.set("oversized", "12345")).toBe(false);
    expect(cache.get("oversized")).toBeNull();
  });

  test("removes expired entries", () => {
    vi.useFakeTimers();
    try {
      const cache = new BoundedMemoryCache<string, string>({
        maxEntries: 10,
        maxBytes: 10,
        ttlMs: 100,
        sizeOf: (value) => value.length
      });
      cache.set("key", "value");
      vi.advanceTimersByTime(101);
      expect(cache.get("key")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
