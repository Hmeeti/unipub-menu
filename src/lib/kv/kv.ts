import { EventEmitter } from "node:events";
import { env } from "@/lib/env";

/** Minimal key-value + pub/sub surface used by limits, idempotency and live status. */
export interface Kv {
  /** Atomically increments a counter, setting the TTL on first increment. Returns new value and remaining TTL (ms). */
  incr(key: string, ttlMs: number): Promise<{ count: number; ttlMs: number }>;
  /** SET key value NX PX ttl. Returns true when the key was set. */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, onMessage: (message: string) => void): Promise<() => Promise<void>>;
  ping(): Promise<boolean>;
}

export class MemoryKv implements Kv {
  private store = new Map<string, { value: string; exp: number }>();
  private bus = new EventEmitter();
  constructor(private now: () => number = () => Date.now()) {
    this.bus.setMaxListeners(0);
  }

  private live(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.exp <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  private sweep() {
    if (this.store.size < 10000) return;
    const t = this.now();
    for (const [k, v] of this.store) if (v.exp <= t) this.store.delete(k);
  }

  async incr(key: string, ttlMs: number) {
    this.sweep();
    const entry = this.live(key);
    if (!entry) {
      this.store.set(key, { value: "1", exp: this.now() + ttlMs });
      return { count: 1, ttlMs };
    }
    entry.value = String(Number(entry.value) + 1);
    return { count: Number(entry.value), ttlMs: entry.exp - this.now() };
  }

  async setNx(key: string, value: string, ttlMs: number) {
    if (this.live(key)) return false;
    this.store.set(key, { value, exp: this.now() + ttlMs });
    return true;
  }

  async set(key: string, value: string, ttlMs: number) {
    this.store.set(key, { value, exp: this.now() + ttlMs });
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async del(key: string) {
    this.store.delete(key);
  }

  async publish(channel: string, message: string) {
    this.bus.emit(channel, message);
  }

  async subscribe(channel: string, onMessage: (message: string) => void) {
    this.bus.on(channel, onMessage);
    return async () => {
      this.bus.off(channel, onMessage);
    };
  }

  async ping() {
    return true;
  }
}

class RedisKv implements Kv {
  private subscriber: import("ioredis").Redis | null = null;
  private handlers = new Map<string, Set<(m: string) => void>>();

  constructor(
    private client: import("ioredis").Redis,
    private url: string,
  ) {}

  async incr(key: string, ttlMs: number) {
    const res = (await this.client.eval(
      "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; return {c, redis.call('PTTL', KEYS[1])}",
      1,
      key,
      String(ttlMs),
    )) as [number, number];
    return { count: Number(res[0]), ttlMs: Math.max(0, Number(res[1])) };
  }

  async setNx(key: string, value: string, ttlMs: number) {
    return (await this.client.set(key, value, "PX", ttlMs, "NX")) === "OK";
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.client.set(key, value, "PX", ttlMs);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async del(key: string) {
    await this.client.del(key);
  }

  async publish(channel: string, message: string) {
    await this.client.publish(channel, message);
  }

  private async ensureSubscriber() {
    if (this.subscriber) return this.subscriber;
    const { Redis } = await import("ioredis");
    const sub = new Redis(this.url, { maxRetriesPerRequest: null, lazyConnect: false });
    sub.on("message", (channel: string, message: string) => {
      for (const h of this.handlers.get(channel) ?? []) h(message);
    });
    this.subscriber = sub;
    return sub;
  }

  async subscribe(channel: string, onMessage: (message: string) => void) {
    const sub = await this.ensureSubscriber();
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      await sub.subscribe(channel);
    }
    set.add(onMessage);
    return async () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(onMessage);
      if (!s.size) {
        this.handlers.delete(channel);
        await sub.unsubscribe(channel);
      }
    };
  }

  async ping() {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}

const g = globalThis as unknown as { __unipubKv?: Kv };

export async function getKv(): Promise<Kv> {
  if (g.__unipubKv) return g.__unipubKv;
  const url = env().REDIS_URL;
  if (url) {
    const { Redis } = await import("ioredis");
    const client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: true });
    client.on("error", () => {
      /* surfaced through ping() in /healthz; avoid crashing the process */
    });
    g.__unipubKv = new RedisKv(client, url);
  } else {
    g.__unipubKv = new MemoryKv();
  }
  return g.__unipubKv;
}

export function __setKvForTests(kv: Kv) {
  g.__unipubKv = kv;
}
