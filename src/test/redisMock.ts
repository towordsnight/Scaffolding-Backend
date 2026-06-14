// In-memory ioredis replacement for integration tests.
// Mapped via moduleNameMapper: "^ioredis$" → this file.
// Call clearStore() in beforeEach to reset state between tests.

const store = new Map<string, string>();

export function clearStore(): void {
  store.clear();
}

class MockRedis {
  // Constructor accepts the same args as ioredis so imports don't throw.
  constructor(_url?: string, _options?: Record<string, unknown>) {}

  async get(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  }

  async set(key: string, value: string, ..._args: unknown[]): Promise<'OK'> {
    store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return store.delete(key) ? 1 : 0;
  }

  async expire(_key: string, _ttl: number): Promise<number> {
    return 1;
  }

  // Satisfy the EventEmitter interface used in src/redis/client.ts
  on(_event: string, _handler: (...args: unknown[]) => void): this {
    return this;
  }
}

export default MockRedis;
