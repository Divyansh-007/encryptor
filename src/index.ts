// Core exports
export { CryptoService } from './crypto.service.js';
export { MemoryReplayStore, ReplayService, ReplayError } from './replay.service.js';
export { RedisReplayStore, createRedisReplayStore } from './replay-redis.service.js';
export { HybridCryptoMiddleware, createCryptoMiddleware } from './middleware.js';
export { ClientCrypto, generateKeyPair } from './client.js';

// NestJS exports
export {
  CryptoModule,
  CRYPTO_SERVICE,
  REPLAY_STORE,
  CRYPTO_OPTIONS,
  type CryptoModuleOptions,
  type CryptoModuleAsyncOptions,
  DecryptionMiddleware,
  EncryptionInterceptor,
  EncryptionGuard,
  SkipEncryption,
  SKIP_ENCRYPTION_KEY,
} from './nestjs/index.js';

// Type exports
export type {
  CryptoContext,
  EncryptedRequest,
  EncryptedBodyPayload,
  EncryptedResponse,
  DecryptedPayload,
  CryptoServiceOptions,
  ReplayServiceOptions,
  RedisReplayServiceOptions,
  ReplayStoreType,
  RedisClient,
  MiddlewareOptions,
  ClientEncryptionResult,
  ClientDecryptionInput,
  ReplayStore,
} from './types.js';
