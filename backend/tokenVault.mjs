import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function createTokenVault(encodedKey) {
  const key = Buffer.from(encodedKey ?? '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey)
    throw Error('DRIVE_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64');
  return {
    seal(uid, credentials) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.from(uid));
      const data = Buffer.concat([
        cipher.update(JSON.stringify(credentials), 'utf8'),
        cipher.final(),
      ]);
      return {
        version: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      };
    },
    open(uid, record) {
      if (record?.version !== 1) throw Error('Unsupported encrypted credential version');
      const iv = Buffer.from(record.iv, 'base64'),
        tag = Buffer.from(record.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) throw Error('Invalid encrypted credential format');
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAAD(Buffer.from(uid));
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(record.data, 'base64')),
          decipher.final(),
        ]).toString('utf8'),
      );
    },
  };
}
