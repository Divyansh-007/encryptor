import * as crypto from 'crypto';
import type { ClientEncryptionResult, ClientDecryptionInput } from './types.js';

const GCM_AUTH_TAG_LENGTH = 16;
const GCM_IV_LENGTH = 12;
const AES_KEY_LENGTH = 32;

export interface ClientCryptoOptions {
  publicKey: string;
}

export class ClientCrypto {
  private readonly publicKey: crypto.KeyObject;

  constructor(options: ClientCryptoOptions) {
    this.publicKey = crypto.createPublicKey(
      this.normalizePem(options.publicKey)
    );
  }

  private normalizePem(pem: string): string {
    return pem.replace(/\\n/g, '\n').trim();
  }

  encryptRequest(data: unknown): ClientEncryptionResult {
    const aesKey = crypto.randomBytes(AES_KEY_LENGTH);
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const requestId = crypto.randomUUID();
    const timestamp = Date.now();

    // Encrypt AES key with RSA public key
    const encryptedKey = crypto.publicEncrypt(
      { key: this.publicKey, oaepHash: 'sha256' },
      aesKey
    );

    // Encrypt payload with AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const plaintext = Buffer.from(JSON.stringify(data));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([ciphertext, authTag]);

    return {
      key: encryptedKey.toString('base64'),
      payload: payload.toString('base64'),
      iv: iv.toString('base64'),
      requestId,
      timestamp,
    };
  }

  encryptGetRequest(): { headers: Record<string, string>; aesKey: Buffer } {
    const aesKey = crypto.randomBytes(AES_KEY_LENGTH);
    const iv = crypto.randomBytes(GCM_IV_LENGTH);

    const encryptedKey = crypto.publicEncrypt(
      { key: this.publicKey, oaepHash: 'sha256' },
      aesKey
    );

    return {
      headers: {
        'x-encrypted': '1',
        'x-encrypted-key': encryptedKey.toString('base64'),
        'x-iv': iv.toString('base64'),
      },
      aesKey,
    };
  }

  decryptResponse(
    input: ClientDecryptionInput,
    aesKey: Buffer
  ): unknown {
    const iv = Buffer.from(input.iv, 'base64');
    const buffer = Buffer.from(input.payload, 'base64');

    if (buffer.length < GCM_AUTH_TAG_LENGTH) {
      throw new Error('Payload too short for GCM auth tag');
    }

    const authTag = buffer.subarray(-GCM_AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(0, buffer.length - GCM_AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  static decryptResponseWithKey(
    input: ClientDecryptionInput,
    aesKey: Buffer
  ): unknown {
    const iv = Buffer.from(input.iv, 'base64');
    const buffer = Buffer.from(input.payload, 'base64');

    if (buffer.length < GCM_AUTH_TAG_LENGTH) {
      throw new Error('Payload too short for GCM auth tag');
    }

    const authTag = buffer.subarray(-GCM_AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(0, buffer.length - GCM_AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }
}

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}
