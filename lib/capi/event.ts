/** Evento da API de Conversões do Meta (https://developers.facebook.com/docs/marketing-api/conversions-api). Puro. */

import type { HashedUserData } from './hash';

export interface CapiEvent {
  event_name: 'Purchase' | 'AddPaymentInfo';
  event_time: number;
  event_id: string;
  action_source: 'website';
  event_source_url: string;
  user_data: HashedUserData;
  custom_data: { value: number; currency: 'BRL'; content_name: string; content_type: 'product'; order_id: string };
}

/** O Meta rejeita eventos com mais de 7 dias. Aqui sobra uma margem de uma hora. */
export const MAX_EVENT_AGE_MS = 7 * 24 * 3600 * 1000 - 3600 * 1000;

/** URL de origem do evento: a do checkout da oferta, quando cadastrada; senão o domínio do checkout da Kiwify. */
export const DEFAULT_SOURCE_URL = 'https://pay.kiwify.com.br/';

export function buildCapiEvent(input: {
  eventName: CapiEvent['event_name'];
  orderId: string;
  /** ID do evento, igual ao do pixel do navegador quando houver (deduplicação). */
  eventId: string;
  eventTime: string;
  valueCents: number;
  userData: HashedUserData;
  offerName: string;
  sourceUrl: string | null;
}): CapiEvent {
  return {
    event_name: input.eventName,
    event_time: Math.floor(Date.parse(input.eventTime) / 1000),
    event_id: input.eventId,
    action_source: 'website',
    event_source_url: input.sourceUrl ?? DEFAULT_SOURCE_URL,
    user_data: input.userData,
    custom_data: {
      value: Math.round(input.valueCents) / 100,
      currency: 'BRL',
      content_name: input.offerName.slice(0, 100),
      content_type: 'product',
      order_id: input.orderId,
    },
  };
}
