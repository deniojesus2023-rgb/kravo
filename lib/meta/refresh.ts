/** Atualização ao abrir o app: quando a última leitura do Meta está velha, a trakfy lê as métricas de hoje em segundo plano. */

import type { ConnectionStatus } from '@/lib/data/types';

export const REFRESH_AFTER_MINUTES = 2;
/** Se a última leitura falhou, espera mais antes de tentar de novo (não insiste num erro, como limite de uso). */
export const REFRESH_AFTER_FAILURE_MINUTES = 15;

export function shouldRefresh(connection: { status: ConnectionStatus; lastSync: { delayMinutes: number; ok: boolean } | null }): boolean {
  if (connection.status !== 'conectado' && connection.status !== 'expirando') return false;
  // A primeira leitura é sempre manual ("Sincronizar agora"), com a lista de campanhas em vista.
  if (!connection.lastSync) return false;
  return connection.lastSync.delayMinutes >= (connection.lastSync.ok ? REFRESH_AFTER_MINUTES : REFRESH_AFTER_FAILURE_MINUTES);
}

/** Várias abas ou várias navegações ao mesmo tempo disparam uma leitura só por instância do servidor. */
const recent = new Map<string, number>();

export function claimRefresh(userId: string, nowMs: number, guardMs = 60_000): boolean {
  const last = recent.get(userId);
  if (last !== undefined && nowMs - last < guardMs) return false;
  recent.set(userId, nowMs);
  if (recent.size > 1000) for (const [key, at] of recent) if (nowMs - at > guardMs) recent.delete(key);
  return true;
}
