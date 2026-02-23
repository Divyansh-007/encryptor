import express from 'express';
import { createCryptoMiddleware, generateKeyPair, ClientCrypto } from '../src/index.js';

// Generate keys for demo (in production, load from env)
const { publicKey, privateKey } = generateKeyPair();

const app = express();
app.use(express.json());

// Create and apply crypto middleware with MEMORY store (default)
const crypto = createCryptoMiddleware({
  privateKey,
  replayProtection: true,
  replayMaxAge: 30000,
  replayStore: 'memory', // This is the default, can be omitted
});

app.use(crypto.middleware());

// Example routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/api/echo', (req, res) => {
  res.json({ received: req.body });
});

app.get('/api/user/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'John Doe', email: 'john@example.com' });
});

app.post('/api/user', (req, res) => {
  const { name, email } = req.body;
  res.json({ id: Math.random().toString(36).slice(2), name, email, created: true });
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Using MEMORY store for replay protection\n');
  console.log('--- Testing Encryption ---\n');

  testEncryption();
});

async function testEncryption() {
  const client = new ClientCrypto({ publicKey });

  // Test POST request
  console.log('1. Testing POST /api/echo with encrypted body...');
  const postData = { message: 'Hello, encrypted world!', number: 42 };
  const encrypted = client.encryptRequest(postData);
  
  console.log('   Original data:', postData);
  console.log('   Encrypted payload (truncated):', encrypted.payload.slice(0, 50) + '...');

  const postResponse = await fetch(`http://localhost:${PORT}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encrypted),
  });

  const postResult = await postResponse.json();
  console.log('   Response (encrypted):', { ...postResult, payload: postResult.payload?.slice(0, 50) + '...' });

  // Test GET request
  console.log('\n2. Testing GET /api/user/123 with encrypted headers...');
  const { headers, aesKey } = client.encryptGetRequest();

  const getResponse = await fetch(`http://localhost:${PORT}/api/user/123`, {
    headers,
  });

  const getResult = await getResponse.json();
  console.log('   Response (encrypted):', { ...getResult, payload: getResult.payload?.slice(0, 50) + '...' });

  // Decrypt response
  const decrypted = client.decryptResponse(getResult, aesKey);
  console.log('   Decrypted response:', decrypted);

  // Test unencrypted request (should pass through)
  console.log('\n3. Testing unencrypted GET /api/health...');
  const healthResponse = await fetch(`http://localhost:${PORT}/api/health`);
  const healthResult = await healthResponse.json();
  console.log('   Response (unencrypted):', healthResult);

  // Test replay protection
  console.log('\n4. Testing replay protection...');
  const replayResponse = await fetch(`http://localhost:${PORT}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encrypted), // Reuse same encrypted payload
  });
  const replayResult = await replayResponse.json();
  console.log('   Replay attempt result:', replayResult);
  console.log('   Status:', replayResponse.status === 400 ? 'BLOCKED (expected)' : 'UNEXPECTED');

  console.log('\n--- All tests completed! ---');
  process.exit(0);
}
