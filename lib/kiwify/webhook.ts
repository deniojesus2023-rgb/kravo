import { createHash, randomBytes } from 'node:crypto';
import type { KiwifySyncOutcome } from './run';

/** Segredo do endereço do webhook: 192 bits aleatórios. Só o hash vai para o banco. */
export const newWebhookSecret = () => randomBytes(24).toString('base64url');
export const hashWebhookSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
const SECRET_FORMAT = /^[A-Za-z0-9_-]{20,64}$/;

export interface WebhookConnection {
  userId: string;
  connectionId: string;
  mode: 'api' | 'webhook';
}

export interface WebhookDeps {
  findConnection(hash: string): Promise<WebhookConnection | null>;
  /** Modo 'api': o aviso só dispara a leitura de vendas pela API. Não pode derrubar a resposta ao webhook. */
  sync(userId: string): Promise<KiwifySyncOutcome>;
  /** Modo 'webhook': o corpo do aviso é a fonte dos dados. Não pode derrubar a resposta ao webhook. */
  receive(connection: WebhookConnection, body: unknown): Promise<unknown>;
  /** Executa depois de responder (`after` do Next). */
  defer(task: () => Promise<unknown>): void;
}

/**
 * Segredo desconhecido ou malformado: 404, sem dizer qual dos dois. Conhecido: responde 200 na hora e processa depois.
 * Modo 'api': o corpo é ignorado e os dados vêm da API oficial (`GET /sales`).
 * Modo 'webhook': o corpo é lido com validação estrita (ver webhook-payload.ts); o que não for entendido é ignorado e
 * aparece na tela, e nunca se inventa um valor.
 */
export async function handleKiwifyWebhook(secret: string, body: unknown, deps: WebhookDeps): Promise<{ status: 200 | 404 }> {
  if (!SECRET_FORMAT.test(secret)) return { status: 404 };
  const connection = await deps.findConnection(hashWebhookSecret(secret));
  if (!connection) return { status: 404 };
  if (connection.mode === 'api') deps.defer(() => deps.sync(connection.userId).catch(() => undefined));
  else deps.defer(() => deps.receive(connection, body).catch(() => undefined));
  return { status: 200 };
}
