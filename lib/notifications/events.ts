/** Que avisos um pedido gera. Puro: sem rede nem banco. */

import type { HashedUserData } from '@/lib/capi/hash';
import type { MappedOrder, OrderStatus, PaymentMethod } from '@/lib/kiwify/orders';

export type OrderEventKind = 'venda_aprovada' | 'pix_gerado' | 'boleto_gerado' | 'reembolso' | 'chargeback';

export interface OrderEvent {
  kind: OrderEventKind;
  /** Um aviso por pedido e tipo, mesmo que a leitura de vendas repita o pedido. */
  dedupeKey: string;
  orderId: string;
  /** `null` = o produto ainda não está ligado a nenhuma oferta (o aviso sai mesmo assim). */
  offerId: string | null;
  /** Nome do produto na plataforma de vendas, usado quando não há oferta. */
  label: string | null;
  amountCents: number;
  paymentMethod: PaymentMethod | null;
  /** Para a API de Conversões (só a venda aprovada usa): data da aprovação e dados do cliente em hash. */
  approvedAt?: string | null;
  userData?: HashedUserData;
}

/** Eventos mais antigos que isto não viram aviso (ex.: leitura retomada depois de dias parada). */
export const MAX_EVENT_AGE_MS = 48 * 60 * 60 * 1000;

const recent = (iso: string | null, now: Date) => iso !== null && now.getTime() - Date.parse(iso) <= MAX_EVENT_AGE_MS;

/**
 * `previous` = estado que a trakfy já conhecia (ausente = pedido novo). Na primeira leitura (`notify = false`) nada vira
 * aviso: seriam 90 dias de pedidos antigos de uma vez.
 */
export function detectOrderEvents(opts: {
  orders: Array<MappedOrder & { offerId: string | null }>;
  previous: Map<string, OrderStatus>;
  now: Date;
  notify: boolean;
}): OrderEvent[] {
  if (!opts.notify) return [];
  const out: OrderEvent[] = [];
  for (const o of opts.orders) {
    const before = opts.previous.get(o.platformOrderId);
    const base = { orderId: o.platformOrderId, offerId: o.offerId, label: o.productName, amountCents: o.amountCents, paymentMethod: o.paymentMethod, approvedAt: o.approvedAt, userData: o.userData };
    const add = (kind: OrderEventKind, key: string) => out.push({ ...base, kind, dedupeKey: `${key}:${o.platformOrderId}` });

    if (o.status === 'aprovado' && before !== 'aprovado' && recent(o.approvedAt, opts.now)) add('venda_aprovada', 'venda');
    else if (o.status === 'reembolsado' && before !== 'reembolsado' && recent(o.refundedAt, opts.now)) add('reembolso', 'reembolso');
    else if (o.status === 'chargeback' && before !== 'chargeback' && recent(o.refundedAt, opts.now)) add('chargeback', 'chargeback');
    else if (o.status === 'pendente' && before === undefined && recent(o.createdAt, opts.now)) {
      if (o.paymentMethod === 'pix') add('pix_gerado', 'pix');
      else if (o.paymentMethod === 'boleto') add('boleto_gerado', 'boleto');
    }
  }
  return out;
}
