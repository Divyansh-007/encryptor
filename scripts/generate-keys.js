#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

console.log('Generated RSA Key Pair (2048-bit)\n');
console.log('='.repeat(50));
console.log('PUBLIC KEY (share with clients):');
console.log('='.repeat(50));
console.log(publicKey);

console.log('='.repeat(50));
console.log('PRIVATE KEY (keep secret on server):');
console.log('='.repeat(50));
console.log(privateKey);

console.log('='.repeat(50));
console.log('\nFor .env file (escape newlines):');
console.log('='.repeat(50));
console.log('\nRSA_PUBLIC_KEY="' + publicKey.replace(/\n/g, '\\n') + '"');
console.log('\nRSA_PRIVATE_KEY="' + privateKey.replace(/\n/g, '\\n') + '"');
