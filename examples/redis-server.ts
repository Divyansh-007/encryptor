/**
 * Example server using Redis for replay protection.
 * 
 * Prerequisites:
 * 1. Install ioredis: npm install ioredis
 * 2. Have Redis running locally or configure REDIS_URL
 * 
 * Run with: npx tsx examples/redis-server.ts
 */

import express from 'express';
import { createCryptoMiddleware, generateKeyPair, ClientCrypto } from '../src/index.js';

// Dynamically import ioredis (optional dependency)
async function main() {
  let Redis;
  try {
    Redis = (await import('ioredis')).default;
  } catch {
    console.error('ioredis is not installed. Install it with: npm install ioredis');
    console.log('\nFalling back to memory store example...');
    console.log('Run: npx tsx examples/basic-server.ts');
    process.exit(1);
  }

  // Generate keys for demo
  const { publicKey, privateKey } = generateKeyPair();

  // Create Redis client
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  redis.on('connect', () => console.log('Connected to Redis'));
  redis.on('error', (err) => console.error('Redis error:', err));

  const app = express();
  app.use(express.json());

  // Create middleware with REDIS store
  const crypto = createCryptoMiddleware({
    privateKey,
    replayProtection: true,
    replayMaxAge: 30000,
    replayStore: 'redis',
    redis: redis,
    redisKeyPrefix: 'myapp:replay:',
  });

  app.use(crypto.middleware());

  // Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', store: 'redis', timestamp: Date.now() });
  });

  app.post('/api/echo', (req, res) => {
    res.json({ received: req.body });
  });

  const PORT = 3001;

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Using REDIS store for replay protection\n');
    testEncryption();
  });

  // Cleanup on shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    crypto.destroy();
    await redis.quit();
    server.close();
    process.exit(0);
  });

  async function testEncryption() {
    const client = new ClientCrypto({ publicKey });

    console.log('--- Testing with Redis Store ---\n');

    // Test POST
    console.log('1. Testing POST /api/echo...');
    const encrypted = client.encryptRequest({ message: 'Hello Redis!' });

    const response = await fetch(`http://localhost:${PORT}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encrypted),
    });

    const result = await response.json();
    console.log('   Response:', { ...result, payload: result.payload?.slice(0, 40) + '...' });

    // Test replay (should be blocked)
    console.log('\n2. Testing replay protection with Redis...');
    const replayResponse = await fetch(`http://localhost:${PORT}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encrypted),
    });

    const replayResult = await replayResponse.json();
    console.log('   Replay blocked:', replayResult);

    // Check Redis key
    const keys = await redis.keys('myapp:replay:*');
    console.log('\n3. Redis keys created:', keys.length);

    console.log('\n--- Redis tests completed! ---');
    
    // Cleanup
    crypto.destroy();
    await redis.quit();
    server.close();
    process.exit(0);
  }
}

main().catch(console.error);
