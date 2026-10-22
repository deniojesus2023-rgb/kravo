/** Venda da Kiwify → pedido da trakfy. Funções puras: sem rede nem banco. */

import { buildUserData, type HashedUserData } from '@/lib/capi/hash';
import type { KiwifySale } from './client';

export type OrderStatus = 'pendente' | 'aprovado' | 'reembolsado' | 'chargeback' | 'cancelado';

export interface MappedOrder {
  platformOrderId: string;
  productId: string | null;
  productName: string | null;
  paymentMethod: PaymentMethod | null;
  /** Dados do cliente já em hash (SHA-256) para a API de Conversões; vazio se a Kiwify não informou. */
  userData: HashedUserData;
  /** Quando a Kiwify criou a venda (Pix e boleto gerados ainda não têm aprovação). */
  createdAt: string | null;
  status: OrderStatus;
  amountCents: number;
  refundedCents: number;
  approvedAt: string | null;
  refundedAt: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
}

export type PaymentMethod = 'pix' | 'boleto' | 'cartao' | 'outro';

export type SkipReason = 'sem_id' | 'moeda' | 'sem_valor' | 'status_desconhecido' | 'data_invalida';

export type MapResult = { ok: true; order: MappedOrder } | { ok: false; reason: SkipReason };

const iso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v.slice(0, 300) : null;
};

const paymentMethodOf = (value: unknown): PaymentMethod | null => {
  if (typeof value !== 'string' || !value) return null;
  if (value === 'pix' || value === 'boleto') return value;
  return value === 'credit_card' ? 'cartao' : 'outro';
};

const PENDING = new Set(['pending', 'processing', 'waiting_payment', 'authorized']);
const APPROVED = new Set(['paid', 'approved', 'pending_refund', 'refund_requested']);

/**
 * Regras (documentadas em docs/kiwify.md):
 * - Valor = valor cobrado do cliente (`payment.charge_amount`), em BRL. Outra moeda é ignorada, nunca convertida.
 * - Aprovado = pago (inclui pedido de reembolso ainda não concluído). Reembolso e chargeback viram o valor todo.
 * - O banco exige approved_at para aprovado, reembolsado e chargeback; sem `approved_date` usa a data de criação.
 */
export function mapSale(sale: KiwifySale): MapResult {
  const id = text(sale.id);
  if (!id) return { ok: false, reason: 'sem_id' };

  const payment = sale.payment;
  if (!payment || typeof payment.charge_amount !== 'number') return { ok: false, reason: 'sem_valor' };
  if (payment.charge_currency !== 'BRL') return { ok: false, reason: 'moeda' };
  const amountCents = Math.round(payment.charge_amount);
  if (!Number.isFinite(amountCents) || amountCents < 0) return { ok: false, reason: 'sem_valor' };

  const created = iso(sale.created_at);
  const approvedAt = iso(sale.approved_date) ?? created;
  const updated = iso(sale.updated_at) ?? created;
  const status = String(sale.status ?? '');

  let mapped: Pick<MappedOrder, 'status' | 'refundedCents' | 'approvedAt' | 'refundedAt'>;
  if (status === 'refunded' || status === 'chargedback') {
    if (!approvedAt) return { ok: false, reason: 'data_invalida' };
    mapped = {
      status: status === 'refunded' ? 'reembolsado' : 'chargeback',
      refundedCents: amountCents,
      approvedAt,
      refundedAt: iso(sale.refunded_at) ?? updated,
    };
  } else if (APPROVED.has(status)) {
    if (!approvedAt) return { ok: false, reason: 'data_invalida' };
    mapped = { status: 'aprovado', refundedCents: 0, approvedAt, refundedAt: null };
  } else if (status === 'refused') {
    mapped = { status: 'cancelado', refundedCents: 0, approvedAt: null, refundedAt: null };
  } else if (PENDING.has(status)) {
    mapped = { status: 'pendente', refundedCents: 0, approvedAt: null, refundedAt: null };
  } else {
    return { ok: false, reason: 'status_desconhecido' };
  }

  const t = sale.tracking ?? {};
  return {
    ok: true,
    order: {
      platformOrderId: id,
      productId: text(sale.product?.id),
      productName: text(sale.product?.name),
      paymentMethod: paymentMethodOf(sale.payment_method),
      userData: buildUserData({
        id: sale.customer?.id,
        email: sale.customer?.email,
        phone: sale.customer?.mobile,
        name: sale.customer?.name,
        city: sale.customer?.address?.city,
        state: sale.customer?.address?.state,
        zip: sale.customer?.address?.zipcode,
        country: sale.customer?.country,
      }),
      createdAt: created,
      amountCents,
      ...mapped,
      utm: { source: text(t.utm_source), medium: text(t.utm_medium), campaign: text(t.utm_campaign), content: text(t.utm_content), term: text(t.utm_term) },
    },
  };
}

/** Ids numéricos longos dentro de uma UTM (ex.: `VASOS_CBO|120210000000000` → `120210000000000`). */
export function metaIdsIn(value: string | null): string[] {
  return value ? (value.match(/\d{10,}/g) ?? []) : [];
}
