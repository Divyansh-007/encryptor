import * as crypto from 'crypto';
import type { CryptoServiceOptions, DecryptedPayload } from './types.js';

const GCM_AUTH_TAG_LENGTH = 16;
const GCM_IV_LENGTH = 12;

export class CryptoService {
  private readonly privateKey: crypto.KeyObject;

  constructor(options: CryptoServiceOptions) {
    this.privateKey = crypto.createPrivateKey(
      this.normalizePem(options.privateKey)
    );
  }

  private normalizePem(pem: string): string {
    return pem.replace(/\\n/g, '\n').trim();
  }

  decryptAESKey(encryptedKeyB64: string): Buffer {
    return crypto.privateDecrypt(
      { key: this.privateKey, oaepHash: 'sha256' },
      Buffer.from(encryptedKeyB64, 'base64')
    );
  }

  decryptPayload(payloadB64: string, aesKey: Buffer, ivB64: string): unknown {
    const iv = Buffer.from(ivB64, 'base64');
    const buffer = Buffer.from(payloadB64, 'base64');

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

  encryptResponse(data: unknown, aesKey: Buffer): DecryptedPayload {
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

    const plaintext = Buffer.from(JSON.stringify(data));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([ciphertext, authTag]);

    return {
      payload: payload.toString('base64'),
      iv: iv.toString('base64'),
    };
  }

  encryptResponseWithCustomIv(
    data: unknown,
    aesKey: Buffer,
    ivBase64: string
  ): { payload: string } {
    const iv = Buffer.from(ivBase64, 'base64');
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);

    const plaintext = Buffer.from(JSON.stringify(data));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([ciphertext, authTag]);

    return {
      payload: payload.toString('base64'),
    };
  }
}
