import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Inject,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CryptoService } from '../crypto.service.js';
import type { EncryptedRequest, EncryptedResponse } from '../types.js';
import { CRYPTO_SERVICE } from './crypto.module.js';
import { SKIP_ENCRYPTION_KEY } from './skip-encryption.decorator.js';

@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(
    @Inject(CRYPTO_SERVICE) private readonly cryptoService: CryptoService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skipEncryption = this.reflector.getAllAndOverride<boolean>(
      SKIP_ENCRYPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipEncryption) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<EncryptedRequest>();

    return next.handle().pipe(
      map((data) => {
        const crypto = req.crypto;

        // No encryption context - return raw data
        if (!crypto?.aesKey) {
          return data;
        }

        // Skip encryption for streamable files
        if (data instanceof StreamableFile) {
          return data;
        }

        const { aesKey, requestId, headerIv } = crypto;

        // GET encryption (use same IV from request)
        if (headerIv) {
          const { payload } = this.cryptoService.encryptResponseWithCustomIv(
            data,
            aesKey,
            headerIv,
          );

          const response: EncryptedResponse = {
            encrypted: true,
            version: 'v1',
            payload,
            iv: headerIv,
          };

          return response;
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

        return response;
      }),
    );
  }
}
