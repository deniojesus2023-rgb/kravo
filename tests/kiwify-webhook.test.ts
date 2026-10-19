import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@/lib/kiwify/orders';
import type { OrderStore, OrderUpsert } from '@/lib/kiwify/sync';
import { amountCents, parseWebhookPayload, sanitizePayload } from '@/lib/kiwify/webhook-payload';
import { processWebhookBody } from '@/lib/kiwify/webhook-sale';

/**
 * ATENÇÃO: estes avisos são MONTADOS a partir do formato mais provável, não copiados de um aviso real da Kiwify
 * (a documentação pública não os mostra). Servem para garantir que a leitura é tolerante e que nada é inventado.
 * Quando houver um aviso real, ele entra aqui como mais um caso.
 */
const NOW = new Date('2026-10-19T15:00:00.000Z');

const aviso = (over: Record<string, unknown> = {}) => ({
  webhook_event_type: 'order_approved',
  order_id: 'ord-123',
  order_ref: 'AbC123',
  order_status: 'paid',
  payment_method: 'credit_card',
  created_at: '2026-10-19 11:59',
  approved_date: '2026-10-19 12:00',
  Customer: { full_name: 'Maria da Silva', email: 'maria@exemplo.com', CPF: '12345678909', mobile: '+5511999998888' },
  Product: { product_id: 'prod-vasos', product_name: 'Protocolo Vasos' },
  Commissions: { charge_amount: 14990, currency: 'BRL', my_commission: 12000 },
  TrackingParameters: { utm_source: 'fb', utm_campaign: 'VASOS_CBO|120210000000001', utm_content: 'AD|120210000000009', sck: null },
  ...over,
});

describe('parseWebhookPayload', () => {
  it('aviso de venda aprovada vira venda no formato da API', () => {
    const r = parseWebhookPayload(aviso());
    expect(r.reason).toBeNull();
    expect(r.event).toBe('order_approved');
    expect(r.sale).toMatchObject({
      id: 'ord-123',
      status: 'paid',
      payment_method: 'credit_card',
      product: { id: 'prod-vasos', name: 'Protocolo Vasos' },
      payment: { charge_amount: 14990, charge_currency: 'BRL' },
      tracking: { utm_source: 'fb', utm_campaign: 'VASOS_CBO|120210000000001', utm_content: 'AD|120210000000009', utm_medium: null },
    });
  });

  it('datas sem fuso são descartadas (hora ambígua); com fuso são mantidas', () => {
    expect(parseWebhookPayload(aviso()).sale).toMatchObject({ created_at: undefined, approved_date: null });
    expect(parseWebhookPayload(aviso({ created_at: '2026-10-19T11:59:00-03:00', approved_date: '2026-10-19T15:00:00Z' })).sale).toMatchObject({
      created_at: '2026-10-19T14:59:00.000Z',
      approved_date: '2026-10-19T15:00:00.000Z',
    });
  });

  it('nomes de campo em minúsculas e variações também servem', () => {
    const r = parseWebhookPayload({ order_id: 'x1', order_status: 'paid', product: { id: 'p-123456', name: 'P' }, commissions: { charge_amount: '14990' }, tracking: { utm_source: 'g' } });
    expect(r.sale).toMatchObject({ id: 'x1', product: { id: 'p-123456' }, payment: { charge_amount: 14990 }, tracking: { utm_source: 'g' } });
  });

  it('o evento ajuda quando o status vem em outro formato', () => {
    expect(parseWebhookPayload(aviso({ order_status: 'xyz', webhook_event_type: 'pix_created', payment_method: 'pix' })).sale).toMatchObject({ status: 'waiting_payment', payment_method: 'pix' });
    expect(parseWebhookPayload(aviso({ order_status: 'xyz', webhook_event_type: 'order_refunded' })).sale?.status).toBe('refunded');
    expect(parseWebhookPayload(aviso({ order_status: 'xyz', webhook_event_type: 'chargeback' })).sale?.status).toBe('chargedback');
  });

  it('boleto vira boleto; formatos de valor: inteiro = centavos, decimal = reais, o resto = desconhecido', () => {
    expect(parseWebhookPayload(aviso({ payment_method: 'billet' })).sale?.payment_method).toBe('boleto');
    expect(amountCents(14990)).toBe(14990);
    expect(amountCents('14990')).toBe(14990);
    expect(amountCents('149,90')).toBe(14990);
    expect(amountCents('149.90')).toBe(14990);
    expect(amountCents('R$ 149,90')).toBeNull();
    expect(amountCents(-1)).toBeNull();
    expect(amountCents(undefined)).toBeNull();
  });

  it('nunca inventa: sem id, status, produto ou valor, o aviso é ignorado com o motivo', () => {
    expect(parseWebhookPayload(null).reason).toBe('corpo_invalido');
    expect(parseWebhookPayload('texto').reason).toBe('corpo_invalido');
    expect(parseWebhookPayload(aviso({ order_id: undefined })).reason).toBe('sem_id');
    expect(parseWebhookPayload(aviso({ order_status: 'novo', webhook_event_type: 'coisa_nova' })).reason).toBe('status_desconhecido');
    expect(parseWebhookPayload(aviso({ Product: {} })).reason).toBe('sem_produto');
    expect(parseWebhookPayload(aviso({ Commissions: { charge_amount: 'muito' } })).reason).toBe('sem_valor');
  });
});

describe('sanitizePayload: dados pessoais nunca aparecem', () => {
  it('troca texto não seguro por marcador, mantém números, status e UTMs', () => {
    const out = JSON.stringify(sanitizePayload(aviso()));
    for (const secret of ['Maria da Silva', 'maria@exemplo.com', '12345678909', '5511999998888', 'AbC123', 'ord-123']) expect(out).not.toContain(secret);
    expect(out).toContain('"order_status":"paid"');
    expect(out).toContain('"charge_amount":14990');
    expect(out).toContain('VASOS_CBO|120210000000001');
    expect(out).toContain('"Customer":{"full_name":"<texto 14>"');
  });

  it('limita profundidade e tamanho', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'x' } } } } } };
    expect(JSON.stringify(sanitizePayload(deep))).toContain('<…>');
    expect((sanitizePayload({ lista: Array.from({ length: 50 }, (_, i) => i) }) as { lista: unknown[] }).lista).toHaveLength(5);
  });
});

function fakeStore(offers: Record<string, string> = { 'prod-vasos': 'o1' }) {
  const saved = new Map<string, OrderUpsert>();
  const store: OrderStore = {
    offerIdsByProduct: async () => new Map(Object.entries(offers)),
    metaEntities: async () => ({ campaigns: new Map([['120210000000001', 'c1']]), ads: new Map([['120210000000009', 'ad1']]) }),
    previousStatuses: async (ids) => new Map(ids.filter((i) => saved.has(i)).map((i) => [i, saved.get(i)!.status as OrderStatus])),
    previousApprovedAt: async (ids) => new Map(ids.filter((i) => saved.get(i)?.approvedAt).map((i) => [i, saved.get(i)!.approvedAt!])),
    upsertOrders: async (rows) => {
      for (const r of rows) saved.set(r.platformOrderId, r);
    },
  };
  return { store, saved };
}

describe('processWebhookBody (modo URL)', () => {
  const run = (store: OrderStore, body: unknown, at = NOW) => processWebhookBody({ body, store, now: at });

  it('venda aprovada: grava o pedido com a hora do recebimento e liga campanha, anúncio e oferta', async () => {
    const { store, saved } = fakeStore();
    const r = await run(store, aviso());
    expect(r.outcome).toEqual({ kind: 'gravado' });
    expect(saved.get('ord-123')).toMatchObject({ offerId: 'o1', campaignId: 'c1', adId: 'ad1', status: 'aprovado', amountCents: 14990, approvedAt: NOW.toISOString() });
    expect(r.events.map((e) => e.kind)).toEqual(['venda_aprovada']);
    expect(r.product).toEqual({ id: 'prod-vasos', name: 'Protocolo Vasos' });
  });

  it('Pix gerado e depois aprovado: um aviso de cada, e a aprovação mantém o mesmo pedido', async () => {
    const { store, saved } = fakeStore();
    const pix = await run(store, aviso({ order_status: 'waiting_payment', webhook_event_type: 'pix_created', payment_method: 'pix', approved_date: null }));
    expect(pix.events.map((e) => e.kind)).toEqual(['pix_gerado']);
    expect(saved.get('ord-123')).toMatchObject({ status: 'pendente', paymentMethod: 'pix', approvedAt: null });
    const paid = await run(store, aviso({ payment_method: 'pix' }));
    expect(paid.events.map((e) => e.kind)).toEqual(['venda_aprovada']);
    expect(saved.size).toBe(1);
  });

  it('aviso repetido não muda nada (datas e notificações intactas)', async () => {
    const { store, saved } = fakeStore();
    await run(store, aviso());
    const before = saved.get('ord-123')!.approvedAt;
    const again = await run(store, aviso(), new Date('2026-10-19T18:00:00.000Z'));
    expect(again.outcome).toEqual({ kind: 'sem_mudanca' });
    expect(again.events).toEqual([]);
    expect(saved.get('ord-123')!.approvedAt).toBe(before);
  });

  it('reembolso e chargeback mantêm a data de aprovação original e avisam uma vez', async () => {
    const { store, saved } = fakeStore();
    await run(store, aviso());
    const refund = await run(store, aviso({ order_status: 'refunded', webhook_event_type: 'order_refunded', approved_date: undefined }), new Date('2026-10-20T10:00:00.000Z'));
    expect(refund.events.map((e) => e.kind)).toEqual(['reembolso']);
    expect(saved.get('ord-123')).toMatchObject({ status: 'reembolsado', refundedCents: 14990, approvedAt: NOW.toISOString(), refundedAt: '2026-10-20T10:00:00.000Z' });
  });

  it('produto sem oferta: não grava, mas devolve o produto para a tela listar; moeda ≠ BRL é ignorada', async () => {
    const { store, saved } = fakeStore({});
    const r = await run(store, aviso());
    expect(r.outcome).toEqual({ kind: 'sem_oferta' });
    expect(r.product).toEqual({ id: 'prod-vasos', name: 'Protocolo Vasos' });
    expect(saved.size).toBe(0);
    const usd = await run(fakeStore().store, aviso({ Commissions: { charge_amount: 100, currency: 'USD' } }));
    expect(usd.outcome).toEqual({ kind: 'ignorado', reason: 'moeda' });
  });

  it('aviso que a trakfy não entende vira "ignorado" com motivo, sem gravar nem avisar', async () => {
    const { store, saved } = fakeStore();
    const r = await run(store, { ola: 'mundo' });
    expect(r.outcome).toEqual({ kind: 'ignorado', reason: 'sem_id' });
    expect(r.events).toEqual([]);
    expect(saved.size).toBe(0);
    expect(JSON.stringify(r.sample)).toContain('<texto 5>');
  });
});
