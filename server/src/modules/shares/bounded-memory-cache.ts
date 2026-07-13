type CacheEntry<Value> = {
  value: Value;
  expiresAt: number;
  byteSize: number;
};

type BoundedMemoryCacheOptions<Value> = {
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
  sizeOf: (value: Value) => number;
};

export class BoundedMemoryCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();
  private totalBytes = 0;

  constructor(private readonly options: BoundedMemoryCacheOptions<Value>) {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0) throw new Error("maxEntries must be a positive integer.");
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) throw new Error("maxBytes must be a positive integer.");
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new Error("ttlMs must be positive.");
  }

  get(key: Key): Value | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return null;
    }

    // Refresh insertion order so the first key remains the least recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: Key, value: Value): boolean {
    const byteSize = Math.ceil(this.options.sizeOf(value));
    if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > this.options.maxBytes) {
      this.delete(key);
      return false;
    }

    this.delete(key);
    this.pruneExpired();
    while (this.entries.size >= this.options.maxEntries || this.totalBytes + byteSize > this.options.maxBytes) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }

    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.options.ttlMs,
      byteSize
    });
    this.totalBytes += byteSize;
    return true;
  }

  delete(key: Key): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.byteSize);
    return true;
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  private pruneExpired() {
    const currentTime = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= currentTime) this.delete(key);
    }
  }
}
