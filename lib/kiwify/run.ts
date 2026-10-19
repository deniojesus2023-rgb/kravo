import { saoPauloDate } from '@/lib/data/dates';
import { KiwifyApiError, type Kiwify, type KiwifyCredentials } from './client';
import { syncKiwifySales, type OrderStore } from './sync';

/** Códigos curtos e fixos: são o que vai para sync_runs.error e para a tela. Nunca a mensagem da Kiwify. */
export type KiwifySyncErrorCode = 'credencial_invalida' | 'limite_da_kiwify' | 'kiwify_erro' | 'banco';

export type KiwifySyncOutcome =
  | { ok: true; fetched: number; saved: number; semOferta: number }
  | { ok: false; code: KiwifySyncErrorCode | 'sem_conexao' | 'muito_recente' };

export interface KiwifyRunDb {
  connection(userId: string): Promise<{ id: string; lastSyncedAt: string | null; credentials: KiwifyCredentials } | null>;
  lastRunStartedAt(userId: string): Promise<string | null>;
  recordRun(userId: string, run: { startedAt: string; finishedAt: string; ok: boolean; error: string | null }): Promise<void>;
  /** Marca a conexão como "erro" (credencial recusada) ou grava o instante da leitura bem-sucedida. */
  markError(userId: string, connectionId: string): Promise<void>;
  markSynced(userId: string, connectionId: string, at: string): Promise<void>;
  storeFor(userId: string, connectionId: string): OrderStore;
}

export function kiwifyErrorCode(error: unknown): KiwifySyncErrorCode {
  if (error instanceof KiwifyApiError) {
    if (error.status === 429) return 'limite_da_kiwify';
    if (error.status === 400 || error.status === 401 || error.status === 403) {
      // 400 também vale para parâmetro errado; só `auth_error` (ou 401/403) é credencial.
      if (error.status !== 400 || error.code === 'auth_error') return 'credencial_invalida';
    }
    return 'kiwify_erro';
  }
  return 'banco';
}

export async function runKiwifySync(opts: {
  userId: string;
  kiwify: Pick<Kiwify, 'token' | 'sales'>;
  db: KiwifyRunDb;
  now?: Date;
  minIntervalSeconds?: number;
}): Promise<KiwifySyncOutcome> {
  const { userId, kiwify, db } = opts;
  const now = opts.now ?? new Date();

  const connection = await db.connection(userId);
  if (!connection) return { ok: false, code: 'sem_conexao' };

  if (opts.minIntervalSeconds) {
    const last = await db.lastRunStartedAt(userId);
    if (last && now.getTime() - new Date(last).getTime() < opts.minIntervalSeconds * 1000) return { ok: false, code: 'muito_recente' };
  }

  const startedAt = now.toISOString();
  try {
    const { accessToken } = await kiwify.token(connection.credentials.clientId, connection.credentials.clientSecret);
    const result = await syncKiwifySales({
      source: kiwify,
      store: db.storeFor(userId, connection.id),
      auth: { token: accessToken, accountId: connection.credentials.accountId },
      today: saoPauloDate(now),
      lastSyncedAt: connection.lastSyncedAt,
    });
    await db.markSynced(userId, connection.id, startedAt);
    await db.recordRun(userId, { startedAt, finishedAt: new Date().toISOString(), ok: true, error: null });
    return { ok: true, fetched: result.fetched, saved: result.saved, semOferta: result.semOferta };
  } catch (error) {
    const code = kiwifyErrorCode(error);
    if (code === 'credencial_invalida') await db.markError(userId, connection.id).catch(() => {});
    await db.recordRun(userId, { startedAt, finishedAt: new Date().toISOString(), ok: false, error: code }).catch(() => {});
    return { ok: false, code };
  }
}
