import { formatBRL, formatRoas } from '@/lib/format';
import type { OrderEvent, OrderEventKind } from './events';

export interface Preferences {
  sale_approved: boolean;
  pix_generated: boolean;
  boleto_generated: boolean;
  refunded: boolean;
  chargeback: boolean;
  summary_morning: boolean;
  summary_afternoon: boolean;
  summary_evening: boolean;
  hide_amounts: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  sale_approved: true,
  pix_generated: true,
  boleto_generated: true,
  refunded: true,
  chargeback: true,
  summary_morning: true,
  summary_afternoon: true,
  summary_evening: true,
  hide_amounts: false,
};

export const PREFERENCE_FOR_KIND: Record<OrderEventKind, keyof Preferences> = {
  venda_aprovada: 'sale_approved',
  pix_gerado: 'pix_generated',
  boleto_gerado: 'boleto_generated',
  reembolso: 'refunded',
  chargeback: 'chargeback',
};

const TITLE: Record<OrderEventKind, string> = {
  venda_aprovada: 'Venda aprovada',
  pix_gerado: 'Pix gerado',
  boleto_gerado: 'Boleto gerado',
  reembolso: 'Reembolso',
  chargeback: 'Chargeback',
};

export interface Message {
  title: string;
  body: string;
  url: string;
}

/** Texto curto do aviso de um pedido. Com `hide_amounts`, sem valores em dinheiro (aparece na tela bloqueada). */
export function formatOrderEvent(event: OrderEvent, offerName: string, hideAmounts: boolean): Message {
  return {
    title: TITLE[event.kind],
    body: hideAmounts ? offerName : `${offerName} · ${formatBRL(event.amountCents, { decimals: 2 })}`,
    url: `/ofertas/${event.offerId}`,
  };
}

export type SummarySlot = 'manha' | 'tarde' | 'noite';

export const SUMMARY_PREFERENCE: Record<SummarySlot, keyof Preferences> = {
  manha: 'summary_morning',
  tarde: 'summary_afternoon',
  noite: 'summary_evening',
};

const SUMMARY_TITLE: Record<SummarySlot, string> = {
  manha: 'Resumo de ontem',
  tarde: 'Resumo de hoje até agora',
  noite: 'Resumo de hoje',
};

export interface SummaryData {
  spendCents: number;
  approvedOrders: number;
  revenueCents: number;
  refundedCents: number;
  pixPendingOrders: number;
  pixPendingCents: number;
  /** Ofertas com a plataforma de vendas ligada: só nelas existem lucro e ROAS real. */
  connected: { offers: number; spendCents: number; revenueCents: number; refundedCents: number };
  totalOffers: number;
}

/** Resumo do dia. Nunca inventa: sem ofertas com vendas ligadas, mostra só o que existe (gasto) e diz o que falta. */
export function formatSummary(slot: SummarySlot, data: SummaryData, hideAmounts: boolean): Message {
  const money = (cents: number) => (hideAmounts ? null : formatBRL(cents, { decimals: 2 }));
  const parts: string[] = [];

  if (data.approvedOrders > 0) {
    parts.push(`${data.approvedOrders} ${data.approvedOrders === 1 ? 'venda' : 'vendas'}`);
    const rev = money(data.revenueCents);
    if (rev) parts.push(`receita ${rev}`);
    if (data.refundedCents > 0) {
      const ref = money(data.refundedCents);
      parts.push(ref ? `reembolsos ${ref}` : 'com reembolsos');
    }
  } else {
    parts.push('nenhuma venda');
  }
  const spend = money(data.spendCents);
  if (spend && data.spendCents > 0) parts.push(`gasto ${spend}`);

  const c = data.connected;
  if (c.offers > 0 && c.spendCents > 0) {
    parts.push(`ROAS real ${formatRoas(c.revenueCents / c.spendCents)}`);
    const profit = money(c.revenueCents - c.refundedCents - c.spendCents);
    if (profit) parts.push(`lucro ${profit}`);
  } else if (data.totalOffers > 0 && c.offers === 0) {
    parts.push('lucro e ROAS real indisponíveis (ligue as ofertas aos produtos)');
  }
  if (data.pixPendingOrders > 0) {
    const v = money(data.pixPendingCents);
    parts.push(`${data.pixPendingOrders} Pix pendente${data.pixPendingOrders === 1 ? '' : 's'}${v ? ` (${v})` : ''}`);
  }

  return { title: SUMMARY_TITLE[slot], body: parts.join(' · '), url: '/' };
}
