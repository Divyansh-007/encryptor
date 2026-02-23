import type { RedisClient, RedisReplayServiceOptions, ReplayStore } from './types.js';
import { ReplayError } from './replay.service.js';

const DEFAULT_MAX_AGE = 30_000; // 30 seconds
const DEFAULT_KEY_PREFIX = 'crypto:replay:';

export class RedisReplayStore implements ReplayStore {
  private readonly redis: RedisClient;
  private readonly maxAge: number;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;

  constructor(redis: RedisClient, options: RedisReplayServiceOptions = {}) {
    this.redis = redis;
    this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.ttlSeconds = Math.ceil((this.maxAge * 2) / 1000);
  }

  async validate(params: { requestId?: string; timestamp?: number }): Promise<void> {
    const { requestId, timestamp } = params;

    if (!requestId || !timestamp) {
      throw new ReplayError('Missing requestId or timestamp');
    }

    const now = Date.now();

    if (Math.abs(now - timestamp) > this.maxAge) {
      throw new ReplayError('Request expired');
    }

    const key = `${this.keyPrefix}${requestId}`;

    const isNew = await this.redis.setnx(key, '1');

    if (isNew === 0) {
      throw new ReplayError('Replay detected');
    }

    await this.redis.expire(key, this.ttlSeconds);
  }

  async destroy(): Promise<void> {
    // Redis handles TTL automatically, no cleanup needed
    // If you want to close the connection, do it externally
  }
}

export function createRedisReplayStore(
  redis: RedisClient,
  options?: RedisReplayServiceOptions
): RedisReplayStore {
  return new RedisReplayStore(redis, options);
}
