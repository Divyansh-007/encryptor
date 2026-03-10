/**
 * Example NestJS application with encryption middleware and interceptor.
 * 
 * This example demonstrates:
 * 1. CryptoModule setup with forRoot()
 * 2. DecryptionMiddleware for request decryption
 * 3. EncryptionInterceptor for response encryption
 * 4. SkipEncryption decorator to bypass encryption
 * 
 * Run with: npx ts-node examples/nestjs-app.ts
 */

import 'reflect-metadata';
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Module, 
  NestModule, 
  MiddlewareConsumer,
  Param,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  CryptoModule,
  DecryptionMiddleware,
  EncryptionInterceptor,
  SkipEncryption,
  generateKeyPair,
  ClientCrypto,
} from '../src/index.js';

// Generate keys for demo
const { publicKey, privateKey } = generateKeyPair();

// ============================================
// Controllers
// ============================================

@Controller('api')
class ApiController {
  @Get('health')
  @SkipEncryption() // This route returns unencrypted response
  getHealth() {
    return { status: 'ok', timestamp: Date.now() };
  }

  @Get('user/:id')
  getUser(@Param('id') id: string) {
    return { id, name: 'John Doe', email: 'john@example.com' };
  }

  @Post('user')
  createUser(@Body() body: { name: string; email: string }) {
    return { 
      id: Math.random().toString(36).slice(2), 
      ...body, 
      created: true 
    };
  }

  @Post('echo')
  echo(@Body() body: any) {
    return { received: body };
  }
}

// ============================================
// App Module
// ============================================

@Module({
  imports: [
    // Setup CryptoModule with memory store
    CryptoModule.forRoot({
      privateKey,
      replayProtection: true,
      replayMaxAge: 30000,
      replayStore: 'memory',
    }),
  ],
  controllers: [ApiController],
  providers: [
    // Register EncryptionInterceptor globally
    {
      provide: APP_INTERCEPTOR,
      useClass: EncryptionInterceptor,
    },
  ],
})
class AppModule implements NestModule {
  // Apply DecryptionMiddleware to all routes except excluded ones
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(DecryptionMiddleware)
      .exclude('api/health') // Exclude health check from decryption
      .forRoutes('*');
  }
}

// ============================================
// Bootstrap
// ============================================

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const PORT = 3000;
  await app.listen(PORT);
  
  console.log(`NestJS server running on http://localhost:${PORT}`);
  console.log('Using MEMORY store for replay protection\n');
  
  // Run tests
  await testEncryption(PORT);
  
  await app.close();
}

async function testEncryption(port: number) {
  const client = new ClientCrypto({ publicKey });

  console.log('--- Testing NestJS Encryption ---\n');

  // Test 1: Unencrypted health check (SkipEncryption)
  console.log('1. Testing GET /api/health (SkipEncryption)...');
  const healthRes = await fetch(`http://localhost:${port}/api/health`);
  const healthData = await healthRes.json();
  console.log('   Response (unencrypted):', healthData);

  // Test 2: Encrypted GET request
  console.log('\n2. Testing encrypted GET /api/user/123...');
  const { headers, aesKey } = client.encryptGetRequest();
  const getRes = await fetch(`http://localhost:${port}/api/user/123`, { headers });
  const getEncrypted = await getRes.json();
  console.log('   Response (encrypted):', { ...getEncrypted, payload: getEncrypted.payload?.slice(0, 40) + '...' });
  
  const getDecrypted = client.decryptResponse(getEncrypted, aesKey);
  console.log('   Decrypted:', getDecrypted);

  // Test 3: Encrypted POST request
  console.log('\n3. Testing encrypted POST /api/user...');
  const postData = { name: 'Jane Doe', email: 'jane@example.com' };
  const encrypted = client.encryptRequest(postData);
  
  const postRes = await fetch(`http://localhost:${port}/api/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encrypted),
  });
  const postEncrypted = await postRes.json();
  console.log('   Response (encrypted):', { ...postEncrypted, payload: postEncrypted.payload?.slice(0, 40) + '...' });

  // Test 4: Replay protection
  console.log('\n4. Testing replay protection...');
  const replayRes = await fetch(`http://localhost:${port}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encrypted), // Reuse same request
  });
  const replayData = await replayRes.json();
  console.log('   Replay blocked:', replayData);

  console.log('\n--- All NestJS tests completed! ---');
}

bootstrap().catch(console.error);
