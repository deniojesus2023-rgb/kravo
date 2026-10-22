/** Fila de envio da API de Conversões. Banco e Meta entram por parâmetro (testável). */

import type { OrderEvent } from '@/lib/notifications/events';
import { buildCapiEvent, MAX_EVENT_AGE_MS, type CapiEvent } from './event';
import { capiErrorKind, type SendResult } from './graph';
import type { HashedUserData } from './hash';

export interface PixelConfig {
  offerId: string;
  pixelId: string;
  enabled: boolean;
  testCode: string | null;
}

export interface NewCapiRow {
  userId: string;
  offerId: string;
  platformOrderId: string;
  eventName: 'Purchase' | 'AddPaymentInfo';
  eventId: string;
  eventTime: string;
  valueCents: number;
  userData: HashedUserData;
  test: boolean;
}

export interface QueueRow extends NewCapiRow {
  id: string;
  attempts: number;
  createdAt: string;
}

export interface Settle {
  id: string;
  status: 'enviado' | 'erro' | 'descartado' | 'pendente';
  attempts: number;
  nextAttemptAt?: string;
  error?: string | null;
  sentAt?: string;
}

export interface CapiStore {
  pixelConfigs(userId: string, offerIds: string[]): Promise<Map<string, PixelConfig>>;
  /** Insere só o que ainda não existe (chave: usuário, oferta, evento e ID do evento). */
  insertEvents(rows: NewCapiRow[]): Promise<void>;
  /** Eventos pendentes com a hora de tentar já vencida. `userId` nulo = todos (agendador). */
  due(userId: string | null, now: Date, limit: number): Promise<QueueRow[]>;
  offerInfo(userId: string, offerIds: string[]): Promise<Map<string, { name: string; checkoutUrl: string | null }>>;
  token(userId: string, offerId: string): Promise<string | null>;
  settle(updates: Settle[]): Promise<void>;
  setPixelStatus(userId: string, offerId: string, status: 'ok' | 'token_invalido' | 'erro', at: string): Promise<void>;
}

/** Espera (em minutos) antes de cada nova tentativa. Passadas 6 horas ou 8 tentativas, desiste. */
export const RETRY_MINUTES = [1, 2, 5, 15, 30, 60, 60, 60];
const GIVE_UP_AFTER_MS = 6 * 3600 * 1000;

/** Só a venda aprovada de oferta com envio ligado entra na fila; nunca evento velho demais para o Meta aceitar. */
export function eventsToEnqueue(opts: { userId: string; events: OrderEvent[]; configs: Map<string, PixelConfig>; now: Date }): NewCapiRow[] {
  const rows: NewCapiRow[] = [];
  for (const e of opts.events) {
    if (e.kind !== 'venda_aprovada' || !e.offerId || !e.approvedAt || !e.userData) continue;
    const config = opts.configs.get(e.offerId);
    if (!config?.enabled) continue;
    if (opts.now.getTime() - Date.parse(e.approvedAt) > MAX_EVENT_AGE_MS) continue;
    rows.push({
      userId: opts.userId,
      offerId: e.offerId,
      platformOrderId: e.orderId,
      eventName: 'Purchase',
      eventId: e.orderId,
      eventTime: e.approvedAt,
      valueCents: e.amountCents,
      userData: e.userData,
      test: Boolean(config.testCode),
    });
  }
  return rows;
}

export interface ProcessResult {
  sent: number;
  failed: number;
  retrying: number;
  dropped: number;
}

export async function processQueue(opts: {
  store: CapiStore;
  send: (input: { pixelId: string; token: string; events: CapiEvent[]; testEventCode: string | null }) => Promise<SendResult>;
  now: Date;
  userId?: string | null;
  limit?: number;
}): Promise<ProcessResult> {
  const { store, send, now } = opts;
  const result: ProcessResult = { sent: 0, failed: 0, retrying: 0, dropped: 0 };
  const rows = await store.due(opts.userId ?? null, now, opts.limit ?? 200);
  if (rows.length === 0) return result;

  const byUser = new Map<string, QueueRow[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  for (const [userId, userRows] of byUser) {
    const offerIds = [...new Set(userRows.map((r) => r.offerId))];
    const [configs, offers] = await Promise.all([store.pixelConfigs(userId, offerIds), store.offerInfo(userId, offerIds)]);
    const tokens = new Map<string, string | null>();
    const settles: Settle[] = [];

    for (const r of userRows) {
      const config = configs.get(r.offerId);
      // Envio desligado, pixel removido ou evento velho demais: descarta, sem tentar.
      if (!config?.enabled || now.getTime() - Date.parse(r.eventTime) > MAX_EVENT_AGE_MS) {
        settles.push({ id: r.id, status: 'descartado', attempts: r.attempts, error: config?.enabled ? 'expirado' : 'desligado' });
        result.dropped += 1;
        continue;
      }
      if (!tokens.has(r.offerId)) tokens.set(r.offerId, await store.token(userId, r.offerId));
      const token = tokens.get(r.offerId);
      if (!token) {
        settles.push({ id: r.id, status: 'erro', attempts: r.attempts, error: 'sem_token' });
        result.failed += 1;
        continue;
      }

      const offer = offers.get(r.offerId);
      const event = buildCapiEvent({
        eventName: r.eventName,
        orderId: r.platformOrderId,
        eventId: r.eventId,
        eventTime: r.eventTime,
        valueCents: r.valueCents,
        userData: r.userData,
        offerName: offer?.name ?? 'Oferta',
        sourceUrl: offer?.checkoutUrl ?? null,
      });
      try {
        await send({ pixelId: config.pixelId, token, events: [event], testEventCode: r.test ? config.testCode : null });
        settles.push({ id: r.id, status: 'enviado', attempts: r.attempts + 1, sentAt: now.toISOString(), error: null });
        await store.setPixelStatus(userId, r.offerId, 'ok', now.toISOString());
        result.sent += 1;
      } catch (error) {
        const kind = capiErrorKind(error);
        const attempts = r.attempts + 1;
        if (kind === 'token_invalido') {
          settles.push({ id: r.id, status: 'erro', attempts, error: 'token_invalido' });
          await store.setPixelStatus(userId, r.offerId, 'token_invalido', now.toISOString());
          result.failed += 1;
        } else if (kind === 'dados_invalidos') {
          settles.push({ id: r.id, status: 'erro', attempts, error: 'dados_invalidos' });
          result.failed += 1;
        } else if (attempts >= RETRY_MINUTES.length || now.getTime() - Date.parse(r.createdAt) > GIVE_UP_AFTER_MS) {
          settles.push({ id: r.id, status: 'erro', attempts, error: 'tentativas_esgotadas' });
          result.failed += 1;
        } else {
          const wait = RETRY_MINUTES[attempts - 1]! * 60_000;
          settles.push({ id: r.id, status: 'pendente', attempts, nextAttemptAt: new Date(now.getTime() + wait).toISOString(), error: kind === 'limite' ? 'limite_da_meta' : 'meta_indisponivel' });
          result.retrying += 1;
        }
      }
    }
    if (settles.length > 0) await store.settle(settles);
  }
  return result;
}
