/**
 * Corpo do aviso (webhook) da Kiwify → venda no mesmo formato da API (`KiwifySale`).
 *
 * ATENÇÃO: a documentação pública da Kiwify não descreve o corpo do aviso. Os nomes de campo abaixo são os
 * mais prováveis (order_id, order_status, Product, Commissions, TrackingParameters...) e a leitura é TOLERANTE
 * (maiúsculas ou minúsculas, vários nomes) mas ESTRITA no que importa: sem id, status reconhecido, produto e
 * valor numérico, o aviso é ignorado e a tela mostra por quê. Nunca se inventa um valor.
 */

import type { KiwifySale } from './client';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valor em `path`, ignorando maiúsculas e minúsculas nos nomes. */
function dig(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (!isObject(cur)) return undefined;
    const found = Object.keys(cur).find((k) => k.toLowerCase() === key.toLowerCase());
    cur = found === undefined ? undefined : cur[found];
  }
  return cur;
}

function first(root: unknown, ...paths: string[][]): unknown {
  for (const p of paths) {
    const v = dig(root, p);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

/** Só datas com fuso explícito (Z ou ±hh:mm) são aceitas. Sem fuso a hora é ambígua; quem chama usa o instante do recebimento. */
function isoWithTz(v: unknown): string | undefined {
  const s = str(v);
  if (!s || !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

const STATUS: Record<string, string> = {
  paid: 'paid',
  approved: 'paid',
  refunded: 'refunded',
  chargedback: 'chargedback',
  chargeback: 'chargedback',
  waiting_payment: 'waiting_payment',
  pending: 'pending',
  processing: 'processing',
  authorized: 'authorized',
  refused: 'refused',
  rejected: 'refused',
  refund_requested: 'refund_requested',
  pending_refund: 'pending_refund',
};

const EVENT_STATUS: Record<string, string> = {
  order_approved: 'paid',
  compra_aprovada: 'paid',
  order_refunded: 'refunded',
  compra_reembolsada: 'refunded',
  chargeback: 'chargedback',
  pix_created: 'waiting_payment',
  pix_gerado: 'waiting_payment',
  billet_created: 'waiting_payment',
  boleto_gerado: 'waiting_payment',
  order_rejected: 'refused',
  compra_recusada: 'refused',
};

const METHOD: Record<string, string> = { pix: 'pix', boleto: 'boleto', billet: 'boleto', credit_card: 'credit_card', card: 'credit_card' };

/** Número inteiro = centavos (como na API). Texto com vírgula ou ponto decimal = reais. Qualquer outra forma = desconhecido. */
export function amountCents(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const s = str(v);
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Math.round(Number(s.replace(',', '.')) * 100);
  return null;
}

export type IgnoredReason = 'corpo_invalido' | 'sem_id' | 'status_desconhecido' | 'sem_produto' | 'sem_valor';

export interface ParsedWebhook {
  /** Nome do evento como a Kiwify mandou (lista curta), para mostrar na tela. */
  event: string | null;
  sale: KiwifySale | null;
  reason: IgnoredReason | null;
  product: { id: string; name: string } | null;
}

export function parseWebhookPayload(body: unknown): ParsedWebhook {
  if (!isObject(body)) return { event: null, sale: null, reason: 'corpo_invalido', product: null };

  const event = (str(first(body, ['webhook_event_type'], ['event'], ['trigger'])) ?? '').toLowerCase().slice(0, 40) || null;
  const productId = str(first(body, ['Product', 'product_id'], ['product_id'], ['Product', 'id'], ['product', 'id']));
  const productName = str(first(body, ['Product', 'product_name'], ['product_name'], ['Product', 'name'], ['product', 'name']))?.slice(0, 120);
  const product = productId ? { id: productId, name: productName ?? productId } : null;

  const id = str(first(body, ['order_id'], ['id']));
  if (!id) return { event, sale: null, reason: 'sem_id', product };

  const rawStatus = (str(first(body, ['order_status'], ['status'])) ?? '').toLowerCase();
  const status = STATUS[rawStatus] ?? (event ? EVENT_STATUS[event] : undefined);
  if (!status) return { event, sale: null, reason: 'status_desconhecido', product };
  if (!productId) return { event, sale: null, reason: 'sem_produto', product };

  const cents = amountCents(first(body, ['Commissions', 'charge_amount'], ['charge_amount'], ['payment', 'charge_amount']));
  if (cents === null) return { event, sale: null, reason: 'sem_valor', product };
  // Sem moeda no aviso, vale BRL (a trakfy só lê BRL). Moeda informada e diferente de BRL é ignorada depois, em mapSale.
  const currency = (str(first(body, ['Commissions', 'currency'], ['Commissions', 'charge_currency'], ['charge_currency'], ['currency'])) ?? 'BRL').toUpperCase();

  const tracking = first(body, ['TrackingParameters'], ['tracking']) ?? body;
  const utm = (key: string) => str(dig(tracking, [key]))?.slice(0, 300);
  const method = METHOD[(str(first(body, ['payment_method'])) ?? '').toLowerCase()];

  const sale: KiwifySale = {
    id,
    status,
    payment_method: method,
    created_at: isoWithTz(first(body, ['created_at'])),
    updated_at: isoWithTz(first(body, ['updated_at'])),
    approved_date: isoWithTz(first(body, ['approved_date'])) ?? null,
    refunded_at: isoWithTz(first(body, ['refunded_at'])) ?? null,
    product: { id: productId, name: productName },
    payment: { charge_amount: cents, charge_currency: currency },
    tracking: {
      utm_source: utm('utm_source') ?? null,
      utm_medium: utm('utm_medium') ?? null,
      utm_campaign: utm('utm_campaign') ?? null,
      utm_content: utm('utm_content') ?? null,
      utm_term: utm('utm_term') ?? null,
    },
  };
  return { event, sale, reason: null, product };
}

/** Campos cujo texto pode aparecer na tela. Todo o resto é trocado por um marcador: nome, e-mail, CPF e telefone nunca são mostrados. */
const SAFE_TEXT_KEYS = new Set([
  'order_status', 'status', 'webhook_event_type', 'event', 'trigger', 'payment_method', 'product_type', 'currency', 'charge_currency',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'sck', 'src', 'product_id', 'product_name',
  'created_at', 'updated_at', 'approved_date', 'refunded_at',
]);

/** Estrutura do aviso para exibir e guardar: chaves e números ficam; texto fora da lista segura vira `<texto N>`. */
export function sanitizePayload(value: unknown, key = '', depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (SAFE_TEXT_KEYS.has(key.toLowerCase())) return value.slice(0, 120);
    return `<texto ${Math.min(value.length, 999)}>`;
  }
  if (depth >= 4) return '<…>';
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => sanitizePayload(v, key, depth + 1));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 60)
        .map(([k, v]) => [k.slice(0, 60), sanitizePayload(v, k, depth + 1)]),
    );
  }
  return '<?>';
}
