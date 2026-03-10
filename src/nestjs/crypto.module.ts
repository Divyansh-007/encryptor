import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { CryptoService } from '../crypto.service.js';
import { MemoryReplayStore } from '../replay.service.js';
import { RedisReplayStore } from '../replay-redis.service.js';
import type { ReplayStore, RedisClient } from '../types.js';

export const CRYPTO_SERVICE = 'CRYPTO_SERVICE';
export const REPLAY_STORE = 'REPLAY_STORE';
export const CRYPTO_OPTIONS = 'CRYPTO_OPTIONS';

export interface CryptoModuleOptions {
  privateKey: string;
  replayProtection?: boolean;
  replayMaxAge?: number;
  replayStore?: 'memory' | 'redis';
  redis?: RedisClient;
  redisKeyPrefix?: string;
}

export interface CryptoModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<CryptoModuleOptions> | CryptoModuleOptions;
  inject?: any[];
}

@Module({})
export class CryptoModule {
  static forRoot(options: CryptoModuleOptions): DynamicModule {
    const cryptoServiceProvider: Provider = {
      provide: CRYPTO_SERVICE,
      useFactory: () => new CryptoService({ privateKey: options.privateKey }),
    };

    const replayStoreProvider: Provider = {
      provide: REPLAY_STORE,
      useFactory: (): ReplayStore | null => {
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

        return new MemoryReplayStore({
          maxAge: options.replayMaxAge,
        });
      },
    };

    const optionsProvider: Provider = {
      provide: CRYPTO_OPTIONS,
      useValue: options,
    };

    return {
      module: CryptoModule,
      global: true,
      providers: [cryptoServiceProvider, replayStoreProvider, optionsProvider],
      exports: [CRYPTO_SERVICE, REPLAY_STORE, CRYPTO_OPTIONS],
    };
  }

  static forRootAsync(options: CryptoModuleAsyncOptions): DynamicModule {
    const cryptoServiceProvider: Provider = {
      provide: CRYPTO_SERVICE,
      useFactory: (opts: CryptoModuleOptions) => {
        return new CryptoService({ privateKey: opts.privateKey });
      },
      inject: [CRYPTO_OPTIONS],
    };

    const replayStoreProvider: Provider = {
      provide: REPLAY_STORE,
      useFactory: (opts: CryptoModuleOptions): ReplayStore | null => {
        if (opts.replayProtection === false) {
          return null;
        }

        if (opts.replayStore === 'redis') {
          if (!opts.redis) {
            throw new Error('Redis client is required when replayStore is "redis"');
          }
          return new RedisReplayStore(opts.redis, {
            maxAge: opts.replayMaxAge,
            keyPrefix: opts.redisKeyPrefix,
          });
        }

        return new MemoryReplayStore({
          maxAge: opts.replayMaxAge,
        });
      },
      inject: [CRYPTO_OPTIONS],
    };

    const asyncOptionsProvider: Provider = {
      provide: CRYPTO_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: CryptoModule,
      global: true,
      imports: options.imports || [],
      providers: [asyncOptionsProvider, cryptoServiceProvider, replayStoreProvider],
      exports: [CRYPTO_SERVICE, REPLAY_STORE, CRYPTO_OPTIONS],
    };
  }
}
