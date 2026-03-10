# Encryptor Library

Hybrid RSA + AES-256-GCM encryption middleware for **Express.js** and **NestJS** applications. Provides end-to-end encryption for API requests and responses with replay attack protection.

## Features

- **Hybrid Encryption**: RSA-OAEP for key exchange + AES-256-GCM for payload encryption
- **Framework Support**: Works with both Express.js and NestJS
- **Automatic Request/Response Encryption**: Middleware/Interceptor handles encryption transparently
- **Replay Attack Protection**: Built-in protection with pluggable storage backends
  - **Memory Store**: In-memory Map (default, no dependencies)
  - **Redis Store**: Redis-based storage for distributed systems
- **TypeScript Support**: Full type definitions included
- **Zero External Dependencies**: Uses Node.js built-in `crypto` module

## Installation

```bash
npm install @developers-joyride/encryptor
```

## Table of Contents

- [Express.js Usage](#expressjs-usage)
- [NestJS Usage](#nestjs-usage)
- [Client Setup](#client-setup)
- [Storage Backends](#storage-backends)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)

---

## Express.js Usage

### Quick Start

```typescript
import express from "express";
import { createCryptoMiddleware } from "@developers-joyride/encryptor";

const app = express();
app.use(express.json());

const crypto = createCryptoMiddleware({
  privateKey: process.env.RSA_PRIVATE_KEY!,
  replayProtection: true,
  replayMaxAge: 30000,
  replayStore: "memory", // or 'redis'
});

app.use(crypto.middleware());

app.post("/api/users", (req, res) => {
  const { name, email } = req.body;
  res.json({ id: 1, name, email });
});

app.listen(3000);
```

### With Redis Store

```typescript
import Redis from "ioredis";
import { createCryptoMiddleware } from "@developers-joyride/encryptor";

const redis = new Redis();

const crypto = createCryptoMiddleware({
  privateKey: process.env.RSA_PRIVATE_KEY!,
  replayStore: "redis",
  redis: redis,
  redisKeyPrefix: "myapp:replay:",
});

app.use(crypto.middleware());
```

---

## NestJS Usage

### Module Setup

```typescript
import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import {
  CryptoModule,
  DecryptionMiddleware,
  EncryptionInterceptor,
} from "@developers-joyride/encryptor";

@Module({
  imports: [
    CryptoModule.forRoot({
      privateKey: process.env.RSA_PRIVATE_KEY!,
      replayProtection: true,
      replayMaxAge: 30000,
      replayStore: "memory", // or 'redis'
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: EncryptionInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(DecryptionMiddleware)
      .exclude("health", "public/(.*)")
      .forRoutes("*");
  }
}
```

### Async Configuration

```typescript
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
    CryptoModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        privateKey: config.get("RSA_PRIVATE_KEY")!,
        replayProtection: true,
        replayStore: "redis",
        redis: new Redis(config.get("REDIS_URL")),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Using Guard Instead of Middleware

If you prefer guards over middleware:

```typescript
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import {
  CryptoModule,
  EncryptionGuard,
  EncryptionInterceptor,
} from "@developers-joyride/encryptor";

@Module({
  imports: [CryptoModule.forRoot({ privateKey: "..." })],
  providers: [
    {
      provide: APP_GUARD,
      useClass: EncryptionGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EncryptionInterceptor,
    },
  ],
})
export class AppModule {}
```

### Skip Encryption Decorator

Use `@SkipEncryption()` to bypass encryption for specific routes:

```typescript
import { Controller, Get } from "@nestjs/common";
import { SkipEncryption } from "@developers-joyride/encryptor";

@Controller("api")
export class ApiController {
  @Get("health")
  @SkipEncryption()
  getHealth() {
    return { status: "ok" }; // Not encrypted
  }

  @Get("data")
  getData() {
    return { secret: "value" }; // Encrypted
  }
}

// Or skip for entire controller
@SkipEncryption()
@Controller("public")
export class PublicController {
  @Get("info")
  getInfo() {
    return { public: true }; // Not encrypted
  }
}
```

---

## Client Setup

### Generate RSA Key Pair

```bash
npm run generate-keys
```

Or programmatically:

```typescript
import { generateKeyPair } from "@developers-joyride/encryptor";

const { publicKey, privateKey } = generateKeyPair();
```

### Client-Side Encryption

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
  // Note: Store aesKey from encryptRequest for decryption
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

---

## Storage Backends

### Memory Store (Default)

Best for single-server deployments and development:

```typescript
// Express
const crypto = createCryptoMiddleware({
  privateKey: "...",
  replayStore: "memory",
});

// NestJS
CryptoModule.forRoot({
  privateKey: "...",
  replayStore: "memory",
});
```

### Redis Store

Best for distributed/clustered deployments:

```typescript
import Redis from "ioredis";

const redis = new Redis();

// Express
const crypto = createCryptoMiddleware({
  privateKey: "...",
  replayStore: "redis",
  redis: redis,
  redisKeyPrefix: "app:replay:",
});

// NestJS
CryptoModule.forRoot({
  privateKey: "...",
  replayStore: "redis",
  redis: redis,
  redisKeyPrefix: "app:replay:",
});
```

---

## How It Works

### Encryption Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    POST/PUT/PATCH Request                   │
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
│                       GET Request                           │
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
│                    Encrypted Response                       │
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

---

## API Reference

### Express.js

#### `createCryptoMiddleware(options)`

```typescript
interface MiddlewareOptions {
  privateKey: string;
  replayProtection?: boolean; // default: true
  replayMaxAge?: number; // default: 30000
  replayStore?: "memory" | "redis"; // default: 'memory'
  redis?: RedisClient;
  redisKeyPrefix?: string; // default: 'crypto:replay:'
  onError?: (error: Error, req: Request) => void;
}
```

### NestJS

#### `CryptoModule.forRoot(options)`

```typescript
interface CryptoModuleOptions {
  privateKey: string;
  replayProtection?: boolean;
  replayMaxAge?: number;
  replayStore?: "memory" | "redis";
  redis?: RedisClient;
  redisKeyPrefix?: string;
}
```

#### `CryptoModule.forRootAsync(options)`

```typescript
interface CryptoModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<CryptoModuleOptions> | CryptoModuleOptions;
  inject?: any[];
}
```

#### Components

| Component               | Type        | Description                          |
| ----------------------- | ----------- | ------------------------------------ |
| `DecryptionMiddleware`  | Middleware  | Decrypts incoming requests           |
| `EncryptionInterceptor` | Interceptor | Encrypts outgoing responses          |
| `EncryptionGuard`       | Guard       | Alternative to middleware            |
| `SkipEncryption`        | Decorator   | Bypasses encryption for route/controller |

#### Injection Tokens

```typescript
import { CRYPTO_SERVICE, REPLAY_STORE, CRYPTO_OPTIONS } from "@developers-joyride/encryptor";

@Injectable()
export class MyService {
  constructor(
    @Inject(CRYPTO_SERVICE) private cryptoService: CryptoService,
    @Inject(REPLAY_STORE) private replayStore: ReplayStore,
  ) {}
}
```

### Client

#### `ClientCrypto`

```typescript
class ClientCrypto {
  constructor(options: { publicKey: string });

  encryptRequest(data: unknown): ClientEncryptionResult;
  encryptGetRequest(): { headers: Record<string, string>; aesKey: Buffer };
  decryptResponse(input: { payload: string; iv: string }, aesKey: Buffer): unknown;
}
```

#### `generateKeyPair()`

```typescript
function generateKeyPair(): { publicKey: string; privateKey: string };
```

---

## Security Considerations

1. **Key Management**: Store RSA private key securely (environment variables, secrets manager)
2. **Key Rotation**: Implement key rotation strategy for production
3. **HTTPS**: Always use HTTPS in production (encryption doesn't replace TLS)
4. **Replay Protection**: Enable for mutation operations (POST/PUT/PATCH/DELETE)
5. **Redis Security**: Use authentication and TLS for Redis in production

## License

MIT
