import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { CryptoService } from './crypto.service.js';
import { MemoryReplayStore, ReplayError } from './replay.service.js';
import { RedisReplayStore } from './replay-redis.service.js';
import type {
  EncryptedRequest,
  EncryptedBodyPayload,
  MiddlewareOptions,
  EncryptedResponse,
  ReplayStore,
} from './types.js';

export class HybridCryptoMiddleware {
  private readonly cryptoService: CryptoService;
  private readonly replayStore: ReplayStore | null;
  private readonly onError?: (error: Error, req: Request) => void;

  constructor(options: MiddlewareOptions) {
    this.cryptoService = new CryptoService({ privateKey: options.privateKey });
    this.replayStore = this.createReplayStore(options);
    this.onError = options.onError;
  }

  private createReplayStore(options: MiddlewareOptions): ReplayStore | null {
    if (options.replayProtection === false) {
      return null;
    }

    if (options.replayStore === 'redis') {
      if (!options.redis) {
        throw new Error('Redis client is required when replayStore is "redis"');
      }
      return new RedisReplayStore(options.redis, {
        maxAge: options.replayMaxAge,
        keyPrefix: options.redisKeyPrefix,
      });
    }

    // Default to memory store
    return new MemoryReplayStore({
      maxAge: options.replayMaxAge,
    });
  }

  decryption(): RequestHandler {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const encReq = req as EncryptedRequest;
        const isGet = req.method === 'GET';
        const isEncryptedGet = req.headers['x-encrypted'] === '1';

        // GET with header-based encryption
        if (isGet && isEncryptedGet) {
          const encryptedKey = req.headers['x-encrypted-key'] as string;
          const iv = req.headers['x-iv'] as string;

          if (!encryptedKey || !iv) {
            res.status(400).json({ error: 'Missing encryption headers' });
            return;
          }

          const aesKey = this.cryptoService.decryptAESKey(encryptedKey);

          encReq.crypto = {
            aesKey,
            headerIv: iv,
          };

          next();
          return;
        }

        // Body-based encryption (POST/PUT/PATCH/DELETE)
        const raw = req.body ?? {};
        const body = this.extractEncryptedBody(raw);

        if (!isGet && body) {
          const { payload, key, iv, requestId, timestamp } = body;

          // Replay protection
          if (this.replayStore) {
            await this.replayStore.validate({ requestId, timestamp });
          }

          const aesKey = this.cryptoService.decryptAESKey(key);
          const decrypted = this.cryptoService.decryptPayload(payload, aesKey, iv);

          req.body = decrypted;

          encReq.crypto = {
            aesKey,
            requestId,
          };
        }

        next();
      } catch (error) {
        this.handleError(error as Error, req, res);
      }
    };
  }

  encryption(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      const encReq = req as EncryptedRequest;
      const originalJson = res.json.bind(res);

      res.json = (data: unknown): Response => {
        const crypto = encReq.crypto;

        // No encryption context - return raw data
        if (!crypto?.aesKey) {
          return originalJson(data);
        }

        const { aesKey, requestId, headerIv } = crypto;

        // GET encryption (use same IV from request)
        if (headerIv) {
          const { payload } = this.cryptoService.encryptResponseWithCustomIv(
            data,
            aesKey,
            headerIv
          );

          const response: EncryptedResponse = {
            encrypted: true,
            version: 'v1',
            payload,
            iv: headerIv,
          };

          return originalJson(response);
        }

        // POST/PUT/PATCH encryption (generate new IV)
        const { payload, iv } = this.cryptoService.encryptResponse(data, aesKey);

        const response: EncryptedResponse = {
          encrypted: true,
          version: 'v1',
          requestId,
          payload,
          iv,
        };

        return originalJson(response);
      };

      next();
    };
  }

  middleware(): RequestHandler[] {
    return [this.decryption(), this.encryption()];
  }

  private extractEncryptedBody(raw: unknown): EncryptedBodyPayload | null {
    if (!raw || typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;

    // Direct format: { payload, key, iv, ... }
    if (
      obj.payload != null &&
      obj.key != null &&
      obj.iv != null
    ) {
      return obj as unknown as EncryptedBodyPayload;
    }

    // Wrapped format: { data: { payload, key, iv, ... } }
    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>;
      if (
        data.payload != null &&
        data.key != null &&
        data.iv != null
      ) {
        return data as unknown as EncryptedBodyPayload;
      }
    }

    return null;
  }

  private handleError(error: Error, req: Request, res: Response): void {
    if (this.onError) {
      this.onError(error, req);
    }

    if (error instanceof ReplayError) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error.message.includes('decrypt') || error.message.includes('Payload')) {
      res.status(400).json({ error: 'Decryption failed' });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }

  destroy(): void | Promise<void> {
    return this.replayStore?.destroy();
  }
}

export function createCryptoMiddleware(options: MiddlewareOptions): HybridCryptoMiddleware {
  return new HybridCryptoMiddleware(options);
}
