/**
 * Núcleo da sincronização de vendas da Kiwify: `GET /sales` → pedidos. Sem rede nem banco aqui:
 * o cliente e o armazenamento entram por parâmetro (testável).
 */

import { addDays } from '@/lib/data/dates';
import type { KiwifySale } from './client';
import { detectOrderEvents, type OrderEvent } from '@/lib/notifications/events';
import { mapSale, metaIdsIn, type MappedOrder, type OrderStatus, type SkipReason } from './orders';

export interface KiwifySalesSource {
  sales(auth: { token: string; accountId: string }, start: string, end: string, updatedSince?: string): Promise<KiwifySale[]>;
}

export interface OrderUpsert extends MappedOrder {
  offerId: string;
  campaignId: string | null;
  adId: string | null;
}

export interface OrderStore {
  /** Produto da Kiwify → oferta (offers.sales_product_id). */
  offerIdsByProduct(): Promise<Map<string, string>>;
  /** Ids internos das campanhas e dos anúncios do Meta pelos ids da Meta. */
  metaEntities(campaignMetaIds: string[], adMetaIds: string[]): Promise<{ campaigns: Map<string, string>; ads: Map<string, string> }>;
  /** Estado que a trakfy já tinha de cada pedido (ausente = pedido novo). */
  previousStatuses(platformOrderIds: string[]): Promise<Map<string, OrderStatus>>;
  /** Data de aprovação já gravada (aviso de reembolso sem a data original). */
  previousApprovedAt(platformOrderIds: string[]): Promise<Map<string, string>>;
  upsertOrders(rows: OrderUpsert[]): Promise<void>;
}

export interface SalesSyncResult {
  fetched: number;
  saved: number;
  semOferta: number;
  ignoradas: Partial<Record<SkipReason, number>>;
  /** Avisos a enviar (venda aprovada, Pix gerado...). Vazio na primeira leitura. */
  events: OrderEvent[];
}

/** A API limita o período a 90 dias. Na primeira vez lê tudo isso; depois, só o que mudou desde a última leitura. */
export function planSalesWindow(today: string, lastSyncedAt: string | null): { start: string; end: string; updatedSince?: string } {
  const start = addDays(today, -89);
  if (!lastSyncedAt) return { start, end: today };
  const since = lastSyncedAt.slice(0, 10);
  return { start, end: today, updatedSince: since < start ? start : addDays(since, -1) };
}

export async function syncKiwifySales(opts: {
  source: KiwifySalesSource;
  store: OrderStore;
  auth: { token: string; accountId: string };
  today: string;
  lastSyncedAt: string | null;
  now?: Date;
}): Promise<SalesSyncResult> {
  const { source, store, auth, today, lastSyncedAt } = opts;
  const window = planSalesWindow(today, lastSyncedAt);
  const sales = await source.sales(auth, window.start, window.end, window.updatedSince);

  const ignoradas: SalesSyncResult['ignoradas'] = {};
  const mapped: MappedOrder[] = [];
  for (const sale of sales) {
    const r = mapSale(sale);
    if (r.ok) mapped.push(r.order);
    else ignoradas[r.reason] = (ignoradas[r.reason] ?? 0) + 1;
  }

  const offers = await store.offerIdsByProduct();
  const known = mapped.filter((o) => o.productId && offers.has(o.productId));
  const entities = await store.metaEntities(
    [...new Set(known.flatMap((o) => metaIdsIn(o.utm.campaign)))],
    [...new Set(known.flatMap((o) => metaIdsIn(o.utm.content)))],
  );

  const rows: OrderUpsert[] = known.map((o) => ({
    ...o,
    offerId: offers.get(o.productId!)!,
    campaignId: metaIdsIn(o.utm.campaign).map((id) => entities.campaigns.get(id)).find(Boolean) ?? null,
    adId: metaIdsIn(o.utm.content).map((id) => entities.ads.get(id)).find(Boolean) ?? null,
  }));
  const previous = rows.length > 0 ? await store.previousStatuses(rows.map((r) => r.platformOrderId)) : new Map<string, OrderStatus>();
  if (rows.length > 0) await store.upsertOrders(rows);

  // Na primeira leitura (sem leitura anterior) nada vira aviso: seriam 90 dias de pedidos antigos de uma vez.
  const events = detectOrderEvents({ orders: rows, previous, now: opts.now ?? new Date(), notify: lastSyncedAt !== null });
  return { fetched: sales.length, saved: rows.length, semOferta: mapped.length - known.length, ignoradas, events };
}
