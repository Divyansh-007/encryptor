# @developers-joyride/encryptor

Hybrid RSA + AES-256-GCM encryption middleware for Express.js applications. Provides end-to-end encryption for API requests and responses with replay attack protection.

## Features

- **Hybrid Encryption**: RSA-OAEP for key exchange + AES-256-GCM for payload encryption
- **Automatic Request/Response Encryption**: Middleware handles encryption transparently
- **Replay Attack Protection**: Built-in protection with pluggable storage backends
  - **Memory Store**: In-memory Map (default, no dependencies)
  - **Redis Store**: Redis-based storage for distributed systems
- **TypeScript Support**: Full type definitions included
- **Zero External Dependencies**: Uses Node.js built-in `crypto` module

## Installation

```bash
npm install @developers-joyride/encryptor
```

## Quick Start

### 1. Generate RSA Key Pair

```bash
npm run generate-keys
```

Or programmatically:

```typescript
import { generateKeyPair } from "@developers-joyride/encryptor";

const { publicKey, privateKey } = generateKeyPair();
```

### 2. Server Setup (Express.js)

#### Using Memory Store (Default)

```typescript
import express from "express";
import { createCryptoMiddleware } from "@developers-joyride/encryptor";

const app = express();
app.use(express.json());

const crypto = createCryptoMiddleware({
  privateKey: process.env.RSA_PRIVATE_KEY!,
  replayProtection: true, // Enable replay protection (default: true)
  replayMaxAge: 30000, // Request expiry time in ms (default: 30000)
  replayStore: "memory", // Use in-memory Map (default)
});

app.use(crypto.middleware());

app.post("/api/users", (req, res) => {
  const { name, email } = req.body;
  res.json({ id: 1, name, email });
});

app.listen(3000);
```

#### Using Redis Store

```typescript
import express from "express";
import Redis from "ioredis";
import { createCryptoMiddleware } from "@developers-joyride/encryptor";

const app = express();
app.use(express.json());

// Create Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

const crypto = createCryptoMiddleware({
  privateKey: process.env.RSA_PRIVATE_KEY!,
  replayProtection: true,
  replayMaxAge: 30000,
  replayStore: "redis", // Use Redis
  redis: redis, // Pass Redis client
  redisKeyPrefix: "myapp:replay:", // Optional custom prefix
});

app.use(crypto.middleware());

app.post("/api/users", (req, res) => {
  const { name, email } = req.body;
  res.json({ id: 1, name, email });
});

// Cleanup on shutdown
process.on("SIGTERM", async () => {
  crypto.destroy();
  await redis.quit();
  process.exit(0);
});

app.listen(3000);
```

### 3. Client Setup

```typescript
import { ClientCrypto } from "@developers-joyride/encryptor";

const client = new ClientCrypto({
  publicKey: process.env.RSA_PUBLIC_KEY!,
});

// POST Request (body-based encryption)
async function createUser(data: { name: string; email: string }) {
  const encrypted = client.encryptRequest(data);

  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(encrypted),
  });

  const encryptedResponse = await response.json();
  return client.decryptResponse(encryptedResponse, aesKey);
}

// GET Request (header-based encryption)
async function getUser(id: string) {
  const { headers, aesKey } = client.encryptGetRequest();

  const response = await fetch(`/api/users/${id}`, { headers });

  const encryptedResponse = await response.json();
  return client.decryptResponse(encryptedResponse, aesKey);
}
```

## Storage Backends

### Memory Store (Default)

Best for:

- Single-server deployments
- Development/testing
- Applications without Redis infrastructure

```typescript
const crypto = createCryptoMiddleware({
  privateKey: "...",
  replayStore: "memory", // or omit (default)
});
```

### Redis Store

Best for:

- Multi-server/clustered deployments
- High-availability requirements
- Shared replay protection across instances

```typescript
import Redis from "ioredis";

const redis = new Redis();

const crypto = createCryptoMiddleware({
  privateKey: "...",
  replayStore: "redis",
  redis: redis,
  redisKeyPrefix: "app:replay:", // Optional, default: 'crypto:replay:'
});
```

**Supported Redis Clients:**

- [ioredis](https://github.com/redis/ioredis) (recommended)
- [node-redis](https://github.com/redis/node-redis)
- Any client implementing the `RedisClient` interface

```typescript
interface RedisClient {
  setnx(key: string, value: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}
```

## How It Works

### Encryption Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    POST/PUT/PATCH Request                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Client:                                                    │
│  1. Generate random AES-256 key (32 bytes)                  │
│  2. Generate random IV (12 bytes)                           │
│  3. Generate unique requestId + timestamp                   │
│  4. Encrypt AES key with server's RSA public key            │
│  5. Encrypt JSON body with AES-256-GCM                      │
│                                                             │
│  Request Body:                                              │
│  {                                                          │
│    key: "<base64(RSA-encrypted AES key)>",                  │
│    payload: "<base64(AES-encrypted body + authTag)>",       │
│    iv: "<base64(12-byte IV)>",                              │
│    requestId: "<uuid>",                                     │
│    timestamp: 1708700000000                                 │
│  }                                                          │
│                                                             │
│  Server:                                                    │
│  1. Validate timestamp (within 30s)                         │
│  2. Check requestId not replayed (Memory/Redis)             │
│  3. RSA decrypt → AES key                                   │
│  4. AES-GCM decrypt → original JSON body                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       GET Request                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Headers:                                                   │
│    x-encrypted: 1                                           │
│    x-encrypted-key: <base64(RSA-encrypted AES key)>         │
│    x-iv: <base64(12-byte IV)>                               │
│                                                             │
│  Server uses same IV for response encryption                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Encrypted Response                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  {                                                          │
│    encrypted: true,                                         │
│    version: "v1",                                           │
│    payload: "<base64(AES-encrypted response + authTag)>",   │
│    iv: "<base64(IV)>",                                      │
│    requestId: "<uuid>"  // Only for POST/PUT/PATCH          │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API Reference

### `createCryptoMiddleware(options)`

Creates a middleware instance.

```typescript
interface MiddlewareOptions {
  privateKey: string; // RSA private key (PEM format)
  replayProtection?: boolean; // Enable replay protection (default: true)
  replayMaxAge?: number; // Request expiry in ms (default: 30000)
  replayStore?: "memory" | "redis"; // Storage backend (default: 'memory')
  redis?: RedisClient; // Redis client (required if replayStore is 'redis')
  redisKeyPrefix?: string; // Redis key prefix (default: 'crypto:replay:')
  onError?: (error: Error, req: Request) => void; // Error handler
}
```

### `HybridCryptoMiddleware`

```typescript
class HybridCryptoMiddleware {
  decryption(): RequestHandler; // Decryption middleware
  encryption(): RequestHandler; // Encryption middleware
  middleware(): RequestHandler[]; // Both middlewares combined
  destroy(): void | Promise<void>; // Cleanup resources
}
```

### `ClientCrypto`

```typescript
class ClientCrypto {
  constructor(options: { publicKey: string });

  encryptRequest(data: unknown): ClientEncryptionResult;
  encryptGetRequest(): { headers: Record<string, string>; aesKey: Buffer };
  decryptResponse(
    input: { payload: string; iv: string },
    aesKey: Buffer,
  ): unknown;
}
```

### `generateKeyPair()`

Generates a new RSA key pair (2048-bit).

```typescript
function generateKeyPair(): { publicKey: string; privateKey: string };
```

### Storage Classes

```typescript
// Memory-based replay store
class MemoryReplayStore implements ReplayStore {
  constructor(options?: { maxAge?: number; cleanupInterval?: number });
  validate(params: { requestId?: string; timestamp?: number }): Promise<void>;
  destroy(): void;
}

// Redis-based replay store
class RedisReplayStore implements ReplayStore {
  constructor(
    redis: RedisClient,
    options?: { maxAge?: number; keyPrefix?: string },
  );
  validate(params: { requestId?: string; timestamp?: number }): Promise<void>;
  destroy(): Promise<void>;
}
```

## Selective Encryption

To skip encryption for certain routes, apply middleware selectively:

```typescript
const crypto = createCryptoMiddleware({ privateKey: "..." });

// Apply to specific routes only
app.use("/api/secure", crypto.middleware());

// Or exclude certain routes
app.use((req, res, next) => {
  if (req.path.startsWith("/public")) {
    return next();
  }
  crypto.decryption()(req, res, () => {
    crypto.encryption()(req, res, next);
  });
});
```

## Security Considerations

1. **Key Management**: Store RSA private key securely (environment variables, secrets manager)
2. **Key Rotation**: Implement key rotation strategy for production
3. **HTTPS**: Always use HTTPS in production (encryption doesn't replace TLS)
4. **Replay Protection**: Enable for mutation operations (POST/PUT/PATCH/DELETE)
5. **Redis Security**: Use authentication and TLS for Redis in production

## License

MIT
