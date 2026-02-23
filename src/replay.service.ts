import type { ReplayServiceOptions, ReplayStore } from './types.js';

interface ReplayEntry {
  timestamp: number;
}

const DEFAULT_MAX_AGE = 30_000; // 30 seconds
const DEFAULT_CLEANUP_INTERVAL = 60_000; // 1 minute

export class MemoryReplayStore implements ReplayStore {
  private readonly store: Map<string, ReplayEntry> = new Map();
  private readonly maxAge: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: ReplayServiceOptions = {}) {
    this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
    const cleanupInterval = options.cleanupInterval ?? DEFAULT_CLEANUP_INTERVAL;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, cleanupInterval);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
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

    const key = `replay:${requestId}`;

    if (this.store.has(key)) {
      throw new ReplayError('Replay detected');
    }

    this.store.set(key, { timestamp: now });
  }

  private cleanup(): void {
    const now = Date.now();
    const expiryThreshold = this.maxAge * 2;

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > expiryThreshold) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

// Backward compatibility alias
export const ReplayService = MemoryReplayStore;
