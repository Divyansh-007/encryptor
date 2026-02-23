import type { Request } from 'express';

export interface CryptoContext {
  aesKey: Buffer;
  requestId?: string;
  headerIv?: string;
}

export interface EncryptedRequest extends Request {
  crypto?: CryptoContext;
}

export interface EncryptedBodyPayload {
  key: string;
  payload: string;
  iv: string;
  requestId?: string;
  timestamp?: number;
}

export interface EncryptedResponse {
  encrypted: true;
  version: string;
  payload: string;
  iv: string;
  requestId?: string;
}

export interface DecryptedPayload {
  payload: string;
  iv: string;
}

export interface CryptoServiceOptions {
  privateKey: string;
}

export interface ReplayServiceOptions {
  maxAge?: number;
  cleanupInterval?: number;
}

export interface RedisReplayServiceOptions {
  maxAge?: number;
  keyPrefix?: string;
}

export type ReplayStoreType = 'memory' | 'redis';

export interface RedisClient {
  setnx(key: string, value: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  set(key: string, value: string, mode: string, duration: number): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  quit(): Promise<string>;
}

export interface MiddlewareOptions {
  privateKey: string;
  replayProtection?: boolean;
  replayMaxAge?: number;
  replayStore?: ReplayStoreType;
  redis?: RedisClient;
  redisKeyPrefix?: string;
  onError?: (error: Error, req: Request) => void;
}

export interface ClientEncryptionResult {
  key: string;
  payload: string;
  iv: string;
  requestId: string;
  timestamp: number;
}

export interface ClientDecryptionInput {
  payload: string;
  iv: string;
}

export interface ReplayStore {
  validate(params: { requestId?: string; timestamp?: number }): Promise<void>;
  destroy(): void | Promise<void>;
}
