import { createHash, randomBytes } from 'node:crypto';
import type { KiwifySyncOutcome } from './run';

/** Segredo do endereço do webhook: 192 bits aleatórios. Só o hash vai para o banco. */
export const newWebhookSecret = () => randomBytes(24).toString('base64url');
export const hashWebhookSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
const SECRET_FORMAT = /^[A-Za-z0-9_-]{20,64}$/;

export interface WebhookDeps {
  findUserByHash(hash: string): Promise<string | null>;
  /** Roda a leitura de vendas do usuário. Não pode derrubar a resposta ao webhook. */
  sync(userId: string): Promise<KiwifySyncOutcome>;
  /** Executa depois de responder (`after` do Next). */
  defer(task: () => Promise<unknown>): void;
}

/**
 * O webhook da Kiwify é só um aviso: o corpo é ignorado e os dados vêm da API oficial (`GET /sales`).
 * Assim a trakfy não depende do formato do corpo nem confia em dados que qualquer um poderia forjar.
 * Segredo desconhecido ou malformado: 404, sem dizer qual dos dois.
 */
export async function handleKiwifyWebhook(secret: string, deps: WebhookDeps): Promise<{ status: 200 | 404 }> {
  if (!SECRET_FORMAT.test(secret)) return { status: 404 };
  const userId = await deps.findUserByHash(hashWebhookSecret(secret));
  if (!userId) return { status: 404 };
  deps.defer(() => deps.sync(userId).catch(() => undefined));
  return { status: 200 };
}
