import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CryptoService } from '../crypto.service.js';
import { ReplayError } from '../replay.service.js';
import type { ReplayStore, EncryptedRequest, EncryptedBodyPayload } from '../types.js';
import { CRYPTO_SERVICE, REPLAY_STORE } from './crypto.module.js';
import { SKIP_ENCRYPTION_KEY } from './skip-encryption.decorator.js';

/**
 * Guard that handles decryption of incoming requests.
 * Use this instead of DecryptionMiddleware if you prefer guard-based approach.
 * 
 * @example
 * // Apply globally in main.ts
 * app.useGlobalGuards(new EncryptionGuard(cryptoService, replayStore, reflector));
 * 
 * @example
 * // Apply to specific controller
 * @UseGuards(EncryptionGuard)
 * @Controller('secure')
 * export class SecureController {}
 */
@Injectable()
export class EncryptionGuard implements CanActivate {
  constructor(
    @Inject(CRYPTO_SERVICE) private readonly cryptoService: CryptoService,
    @Inject(REPLAY_STORE) private readonly replayStore: ReplayStore | null,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipEncryption = this.reflector.getAllAndOverride<boolean>(
      SKIP_ENCRYPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipEncryption) {
      return true;
    }

    const req = context.switchToHttp().getRequest<EncryptedRequest>();

    try {
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

        req.crypto = {
          aesKey,
          headerIv: iv,
        };

        return true;
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

        req.crypto = {
          aesKey,
          requestId,
        };
      }

      return true;
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
