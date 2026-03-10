import { Injectable, NestMiddleware, BadRequestException, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CryptoService } from '../crypto.service.js';
import { ReplayError } from '../replay.service.js';
import type { ReplayStore, EncryptedRequest, EncryptedBodyPayload } from '../types.js';
import { CRYPTO_SERVICE, REPLAY_STORE } from './crypto.module.js';

@Injectable()
export class DecryptionMiddleware implements NestMiddleware {
  constructor(
    @Inject(CRYPTO_SERVICE) private readonly cryptoService: CryptoService,
    @Inject(REPLAY_STORE) private readonly replayStore: ReplayStore | null,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const encReq = req as EncryptedRequest;
      const isGet = req.method === 'GET';
      const isEncryptedGet = req.headers['x-encrypted'] === '1';

      // GET with header-based encryption
      if (isGet && isEncryptedGet) {
        const encryptedKey = req.headers['x-encrypted-key'] as string;
        const iv = req.headers['x-iv'] as string;

        if (!encryptedKey || !iv) {
          throw new BadRequestException('Missing encryption headers');
        }

        const aesKey = this.cryptoService.decryptAESKey(encryptedKey);

        encReq.crypto = {
          aesKey,
          headerIv: iv,
        };

        return next();
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
      if (error instanceof ReplayError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Decryption failed');
    }
  }

  private extractEncryptedBody(raw: unknown): EncryptedBodyPayload | null {
    if (!raw || typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;

    if (obj.payload != null && obj.key != null && obj.iv != null) {
      return obj as unknown as EncryptedBodyPayload;
    }

    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>;
      if (data.payload != null && data.key != null && data.iv != null) {
        return data as unknown as EncryptedBodyPayload;
      }
    }

    return null;
  }
}
