import { saoPauloDate } from '@/lib/data/dates';
import { MetaApiError } from './graph';
import { syncAdAccount, type AccountResult, type AccountToSync, type SyncGraph, type SyncStore } from './sync';

/** Códigos curtos e fixos: são o que vai para sync_runs.error e para a tela. Nunca a mensagem da Meta. */
export type SyncErrorCode = 'token_invalido' | 'limite_da_meta' | 'meta_erro' | 'banco' | 'moeda_nao_suportada';

export type SyncOutcome =
  | { ok: true; accounts: number; campaigns: number; linked: number; unlinked: number; metricRows: number; adsets: number; ads: number }
  | { ok: false; code: SyncErrorCode | 'sem_conexao' | 'sem_contas' | 'muito_recente' | 'expirada' };

export interface RunDb {
  /** Conexão ativa do usuário e as contas escolhidas, ou null se não houver conexão conectada. */
  connection(userId: string): Promise<{ id: string; expiresAt: string | null; token: string; accounts: AccountToSync[] } | null>;
  lastRunStartedAt(userId: string): Promise<string | null>;
  recordRun(userId: string, run: { startedAt: string; finishedAt: string; ok: boolean; error: string | null }): Promise<void>;
  markDisconnected(userId: string, connectionId: string): Promise<void>;
  storeFor(userId: string): SyncStore;
}

const RATE_LIMIT_CODES = [4, 17, 32, 613, 80000, 80003, 80004];

export function errorCodeOf(error: unknown): SyncErrorCode {
  if (error instanceof MetaApiError) {
    if (error.code === 190) return 'token_invalido';
    if (error.code !== null && RATE_LIMIT_CODES.includes(error.code)) return 'limite_da_meta';
    return 'meta_erro';
  }
  if (error instanceof Error && error.message === 'moeda_nao_suportada') return 'moeda_nao_suportada';
  return 'banco';
}

export async function runMetaSync(opts: {
  userId: string;
  graph: SyncGraph;
  db: RunDb;
  now?: Date;
  /** Intervalo mínimo desde a última execução (sincronização manual). 0 no agendador. */
  minIntervalSeconds?: number;
}): Promise<SyncOutcome> {
  const { userId, graph, db } = opts;
  const now = opts.now ?? new Date();

  const connection = await db.connection(userId);
  if (!connection) return { ok: false, code: 'sem_conexao' };
  if (connection.expiresAt && new Date(connection.expiresAt) <= now) return { ok: false, code: 'expirada' };
  if (connection.accounts.length === 0) return { ok: false, code: 'sem_contas' };

  if (opts.minIntervalSeconds) {
    const last = await db.lastRunStartedAt(userId);
    if (last && now.getTime() - new Date(last).getTime() < opts.minIntervalSeconds * 1000) return { ok: false, code: 'muito_recente' };
  }

  const startedAt = now.toISOString();
  const store = db.storeFor(userId);
  const total = { accounts: 0, campaigns: 0, linked: 0, unlinked: 0, metricRows: 0, adsets: 0, ads: 0 };
  let failure: SyncErrorCode | null = null;

  for (const account of connection.accounts) {
    try {
      const r: AccountResult = await syncAdAccount({
        graph,
        store,
        token: connection.token,
        account,
        today: saoPauloDate(now),
        now,
      });
      total.accounts += 1;
      total.campaigns += r.campaigns;
      total.linked += r.linked;
      total.unlinked += r.unlinked;
      total.metricRows += r.metricRows;
      total.adsets += r.adsets;
      total.ads += r.ads;
    } catch (error) {
      const code = errorCodeOf(error);
      failure ??= code;
      if (code === 'token_invalido') {
        await db.markDisconnected(userId, connection.id);
        break;
      }
    }
  }

  await db.recordRun(userId, { startedAt, finishedAt: new Date().toISOString(), ok: failure === null, error: failure });
  return failure ? { ok: false, code: failure } : { ok: true, ...total };
}
