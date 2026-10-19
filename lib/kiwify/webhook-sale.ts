/** Modo URL: um aviso da Kiwify vira (no máximo) um pedido e os avisos de notificação dele. Banco por parâmetro (testável). */

import { detectOrderEvents, type OrderEvent } from '@/lib/notifications/events';
import { mapSale, metaIdsIn } from './orders';
import type { OrderStore, OrderUpsert } from './sync';
import { parseWebhookPayload, sanitizePayload, type IgnoredReason } from './webhook-payload';

export type WebhookOutcome =
  | { kind: 'gravado' }
  | { kind: 'sem_mudanca' }
  | { kind: 'sem_oferta' }
  | { kind: 'ignorado'; reason: IgnoredReason | 'moeda' | 'status_desconhecido' | 'sem_valor' | 'data_invalida' | 'sem_id' };

export interface WebhookResult {
  outcome: WebhookOutcome;
  events: OrderEvent[];
  event: string | null;
  product: { id: string; name: string } | null;
  /** Estrutura do aviso sem dados pessoais, para a tela. */
  sample: unknown;
}

export async function processWebhookBody(opts: { body: unknown; store: OrderStore; now: Date }): Promise<WebhookResult> {
  const { body, store, now } = opts;
  const parsed = parseWebhookPayload(body);
  const base = { event: parsed.event, product: parsed.product, sample: sanitizePayload(body) };
  if (!parsed.sale) return { ...base, outcome: { kind: 'ignorado', reason: parsed.reason ?? 'corpo_invalido' }, events: [] };

  const receivedAt = now.toISOString();
  const sale = { ...parsed.sale };
  const id = sale.id!;
  // Datas sem fuso no aviso são ambíguas: vale o instante em que o aviso chegou (a Kiwify avisa em segundos).
  sale.created_at ??= receivedAt;
  sale.updated_at ??= receivedAt;
  if (['paid', 'refund_requested', 'pending_refund', 'refunded', 'chargedback'].includes(sale.status!)) {
    sale.approved_date ??= (await store.previousApprovedAt([id])).get(id) ?? receivedAt;
  }
  if (sale.status === 'refunded' || sale.status === 'chargedback') sale.refunded_at ??= receivedAt;

  const mapped = mapSale(sale);
  if (!mapped.ok) return { ...base, outcome: { kind: 'ignorado', reason: mapped.reason }, events: [] };
  const order = mapped.order;

  const offerId = (await store.offerIdsByProduct()).get(order.productId ?? '');
  if (!offerId) return { ...base, outcome: { kind: 'sem_oferta' }, events: [] };

  const previous = await store.previousStatuses([order.platformOrderId]);
  // O mesmo aviso repetido (a Kiwify reenvia) não muda nada: nem datas, nem avisos de notificação.
  if (previous.get(order.platformOrderId) === order.status) return { ...base, outcome: { kind: 'sem_mudanca' }, events: [] };

  const entities = await store.metaEntities(metaIdsIn(order.utm.campaign), metaIdsIn(order.utm.content));
  const row: OrderUpsert = {
    ...order,
    offerId,
    campaignId: metaIdsIn(order.utm.campaign).map((x) => entities.campaigns.get(x)).find(Boolean) ?? null,
    adId: metaIdsIn(order.utm.content).map((x) => entities.ads.get(x)).find(Boolean) ?? null,
  };
  await store.upsertOrders([row]);
  const events = detectOrderEvents({ orders: [row], previous, now, notify: true });
  return { ...base, outcome: { kind: 'gravado' }, events };
}
