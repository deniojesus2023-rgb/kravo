import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifra de credenciais (tokens do Meta e das plataformas de venda): AES-256-GCM.
 * Formato: "v1.<iv>.<tag>.<texto cifrado>", tudo em base64url. A chave (32 bytes, base64)
 * vem de TOKEN_ENCRYPTION_KEY e nunca fica no banco nem no repositório.
 * O GCM autentica o conteúdo: qualquer alteração faz a decifragem falhar.
 */

const VERSION = 'v1';

export function parseKey(base64: string | undefined): Buffer {
  const key = Buffer.from(base64 ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY inválida: precisa ser uma chave de 32 bytes em base64.');
  }
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Credencial cifrada em formato desconhecido.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // Mensagem fixa: nunca inclui o conteúdo.
    throw new Error('Não foi possível decifrar a credencial (chave errada ou dado alterado).');
  }
}
