import { describe, expect, it, vi } from 'vitest';
import type { KiwifySale } from '@/lib/kiwify/client';
import { mapSale } from '@/lib/kiwify/orders';
import { syncKiwifySales, type OrderStore, type OrderUpsert } from '@/lib/kiwify/sync';
import { notifyMessage, notifyOrderEvents, type Device, type NotifyDeps, type PushResult } from '@/lib/notifications/dispatch';
import { detectOrderEvents, MAX_EVENT_AGE_MS, type OrderEvent } from '@/lib/notifications/events';
import { DEFAULT_PREFERENCES, formatOrderEvent, formatSummary, type SummaryData } from '@/lib/notifications/format';

const NOW = new Date('2026-10-18T15:00:00.000Z');
const sale = (over: Partial<KiwifySale> = {}): KiwifySale => ({
  id: 'ord-1',
  status: 'paid',
  payment_method: 'credit_card',
  created_at: '2026-10-18T14:50:00.000Z',
  updated_at: '2026-10-18T14:51:00.000Z',
  approved_date: '2026-10-18T14:51:00.000Z',
  product: { id: 'prod-vasos' },
  payment: { charge_amount: 14990, charge_currency: 'BRL' },
  ...over,
});
const order = (s: KiwifySale) => {
  const r = mapSale(s);
  if (!r.ok) throw new Error(r.reason);
  return { ...r.order, offerId: 'o1' };
};

describe('detectOrderEvents', () => {
  const run = (s: KiwifySale, before?: 'pendente' | 'aprovado' | 'reembolsado' | 'chargeback' | 'cancelado', notify = true) =>
    detectOrderEvents({ orders: [order(s)], previous: new Map(before ? [['ord-1', before]] : []), now: NOW, notify });

  it('pedido novo já aprovado: venda aprovada', () => {
    expect(run(sale())).toEqual([expect.objectContaining({ kind: 'venda_aprovada', dedupeKey: 'venda:ord-1', amountCents: 14990, offerId: 'o1' })]);
  });

  it('Pix pendente novo: Pix gerado; depois de aprovado: só venda aprovada (um aviso por etapa)', () => {
    const pix = sale({ status: 'waiting_payment', payment_method: 'pix', approved_date: null });
    expect(run(pix)).toEqual([expect.objectContaining({ kind: 'pix_gerado', dedupeKey: 'pix:ord-1' })]);
    expect(run(sale({ payment_method: 'pix' }), 'pendente')).toEqual([expect.objectContaining({ kind: 'venda_aprovada' })]);
    expect(run(pix, 'pendente')).toEqual([]); // o Pix já era conhecido
  });

  it('boleto pendente novo: boleto gerado; cartão pendente: nada', () => {
    expect(run(sale({ status: 'waiting_payment', payment_method: 'boleto', approved_date: null })).map((e) => e.kind)).toEqual(['boleto_gerado']);
    expect(run(sale({ status: 'processing', payment_method: 'credit_card', approved_date: null }))).toEqual([]);
  });

  it('reembolso e chargeback avisam uma vez, quando mudam de estado', () => {
    const refunded = sale({ status: 'refunded', refunded_at: '2026-10-18T14:55:00.000Z' });
    expect(run(refunded, 'aprovado').map((e) => e.kind)).toEqual(['reembolso']);
    expect(run(refunded, 'reembolsado')).toEqual([]);
    expect(run(sale({ status: 'chargedback', refunded_at: '2026-10-18T14:55:00.000Z' }), 'aprovado').map((e) => e.kind)).toEqual(['chargeback']);
  });

  it('produto sem oferta ligada: avisa com o nome do produto e o aviso "sem oferta ligada", e leva à tela de integrações', async () => {
    const e = detectOrderEvents({ orders: [{ ...order(sale()), offerId: null }], previous: new Map(), now: NOW, notify: true });
    expect(e).toEqual([expect.objectContaining({ kind: 'venda_aprovada', offerId: null, label: null })]);
    const withName = { ...e[0]!, label: 'Example product' };
    expect(formatOrderEvent(withName, 'Example product', false)).toEqual({ title: 'Venda aprovada', body: 'Example product · R$ 149,90 · sem oferta ligada', url: '/integracoes#kiwify' });
    expect(formatOrderEvent(withName, 'Example product', true).body).toBe('Example product · sem oferta ligada');
    const { deps, push } = fakeDeps({ offerNames: async () => new Map() });
    await notifyOrderEvents('u', [withName], deps);
    expect(push).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: 'Example product · R$ 149,90 · sem oferta ligada' }));
  });

  it('o que já estava aprovado não avisa de novo', () => {
    expect(run(sale(), 'aprovado')).toEqual([]);
  });

  it('primeira leitura (notify = false) nunca gera aviso', () => {
    expect(run(sale(), undefined, false)).toEqual([]);
  });

  it('evento antigo (mais de 48 h) não vira aviso', () => {
    const old = new Date(NOW.getTime() - MAX_EVENT_AGE_MS - 60_000).toISOString();
    expect(run(sale({ approved_date: old, created_at: old }))).toEqual([]);
  });
});

describe('texto das notificações', () => {
  const event: OrderEvent = { kind: 'venda_aprovada', dedupeKey: 'venda:x', orderId: 'x', offerId: 'o1', label: 'Vasos', amountCents: 14990, paymentMethod: null };

  it('venda: oferta e valor; com valores escondidos, só a oferta', () => {
    expect(formatOrderEvent(event, 'Vasos', false)).toEqual({ title: 'Venda aprovada', body: 'Vasos · R$ 149,90', url: '/ofertas/o1' });
    expect(formatOrderEvent(event, 'Vasos', true).body).toBe('Vasos');
    expect(formatOrderEvent({ ...event, kind: 'pix_gerado' }, 'Vasos', false).title).toBe('Pix gerado');
  });

  const base: SummaryData = {
    spendCents: 70_000,
    approvedOrders: 12,
    revenueCents: 179_880,
    refundedCents: 14_990,
    pixPendingOrders: 2,
    pixPendingCents: 29_980,
    connected: { offers: 1, spendCents: 70_000, revenueCents: 179_880, refundedCents: 14_990 },
    totalOffers: 1,
  };

  it('resumo com vendas ligadas: receita, gasto, ROAS real e lucro (receita − reembolso − gasto)', () => {
    const m = formatSummary('noite', base, false);
    expect(m.title).toBe('Resumo de hoje');
    expect(m.body).toContain('12 vendas');
    expect(m.body).toContain('receita R$ 1.798,80');
    expect(m.body).toContain('gasto R$ 700,00');
    expect(m.body).toContain('ROAS real 2,57x');
    expect(m.body).toContain('lucro R$ 948,90');
    expect(m.body).toContain('2 Pix pendentes');
    expect(formatSummary('manha', base, false).title).toBe('Resumo de ontem');
  });

  it('sem oferta ligada ao produto: nunca inventa lucro nem ROAS, e diz o que falta', () => {
    const m = formatSummary('tarde', { ...base, approvedOrders: 0, revenueCents: 0, refundedCents: 0, connected: { offers: 0, spendCents: 0, revenueCents: 0, refundedCents: 0 } }, false);
    expect(m.body).toContain('nenhuma venda');
    expect(m.body).not.toMatch(/ROAS real \d|lucro R\$/);
    expect(m.body).toContain('indisponíveis');
  });

  it('com valores escondidos, sem nenhum valor em dinheiro, mas com contagens e ROAS', () => {
    const m = formatSummary('noite', base, true);
    expect(m.body).not.toContain('R$');
    expect(m.body).toContain('12 vendas');
    expect(m.body).toContain('ROAS real 2,57x');
  });
});

function fakeDeps(over: Partial<NotifyDeps> = {}) {
  const inserted = new Map<string, { title: string; body: string }>();
  const push = vi.fn(async (_d: Device, _m: unknown): Promise<PushResult> => 'ok');
  const markSent = vi.fn(async () => {});
  const removeDevice = vi.fn(async () => {});
  const deps: NotifyDeps = {
    preferences: async () => DEFAULT_PREFERENCES,
    devices: async () => [{ id: 'd1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a' }],
    offerNames: async () => new Map([['o1', 'Vasos']]),
    insertNew: async (_u, items) => {
      const fresh = items.filter((i) => !inserted.has(i.dedupeKey));
      for (const i of fresh) inserted.set(i.dedupeKey, i);
      return fresh.map((i) => ({ id: `id-${i.dedupeKey}`, dedupeKey: i.dedupeKey }));
    },
    markSent,
    removeDevice,
    push,
    ...over,
  };
  return { deps, push, markSent, removeDevice, inserted };
}

const venda: OrderEvent = { kind: 'venda_aprovada', dedupeKey: 'venda:1', orderId: '1', offerId: 'o1', label: 'Vasos', amountCents: 14990, paymentMethod: null };

describe('envio', () => {
  it('envia o aviso ao aparelho e marca como enviado', async () => {
    const { deps, push, markSent } = fakeDeps();
    expect(await notifyOrderEvents('u', [venda], deps)).toEqual({ created: 1, delivered: 1 });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push/1' }), expect.objectContaining({ title: 'Venda aprovada', body: 'Vasos · R$ 149,90' }));
    expect(markSent).toHaveBeenCalledWith('id-venda:1', true, null);
  });

  it('o mesmo evento repetido (leitura repetida ou webhook duplicado) não avisa de novo', async () => {
    const { deps, push } = fakeDeps();
    await notifyOrderEvents('u', [venda], deps);
    expect(await notifyOrderEvents('u', [venda], deps)).toEqual({ created: 0, delivered: 0 });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('respeita o que o usuário desligou e a opção de esconder valores', async () => {
    const off = fakeDeps({ preferences: async () => ({ ...DEFAULT_PREFERENCES, sale_approved: false }) });
    expect(await notifyOrderEvents('u', [venda], off.deps)).toEqual({ created: 0, delivered: 0 });
    expect(off.push).not.toHaveBeenCalled();
    const hidden = fakeDeps({ preferences: async () => ({ ...DEFAULT_PREFERENCES, hide_amounts: true }) });
    await notifyOrderEvents('u', [venda], hidden.deps);
    expect(hidden.push).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: 'Vasos' }));
  });

  it('sem aparelho: nada é gravado (quem ativar depois não recebe histórico)', async () => {
    const { deps, inserted } = fakeDeps({ devices: async () => [] });
    expect(await notifyOrderEvents('u', [venda], deps)).toEqual({ created: 0, delivered: 0 });
    expect(inserted.size).toBe(0);
  });

  it('aparelho que revogou (gone) é removido; falha passageira fica registrada sem a mensagem do serviço', async () => {
    const gone = fakeDeps({ push: async () => 'gone' });
    await notifyOrderEvents('u', [venda], gone.deps);
    expect(gone.removeDevice).toHaveBeenCalledWith('d1');
    expect(gone.markSent).toHaveBeenCalledWith('id-venda:1', false, 'sem_aparelho');
    const flaky = fakeDeps({ push: async () => { throw new Error('https://push/1?token=segredo'); } });
    expect(await notifyOrderEvents('u', [venda], flaky.deps)).toEqual({ created: 1, delivered: 0 });
    expect(flaky.markSent).toHaveBeenCalledWith('id-venda:1', false, 'push_erro');
  });

  it('mensagem avulsa (resumo, teste) segue a mesma deduplicação', async () => {
    const { deps, push } = fakeDeps();
    const msg = { title: 'Resumo de hoje', body: 'x', url: '/' };
    await notifyMessage('u', 'resumo', 'resumo:2026-10-18:noite', msg, deps);
    await notifyMessage('u', 'resumo', 'resumo:2026-10-18:noite', msg, deps);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('leitura de vendas → avisos', () => {
  function store() {
    const saved = new Map<string, OrderUpsert>();
    const s: OrderStore = {
      offerIdsByProduct: async () => new Map([['prod-vasos', 'o1']]),
      metaEntities: async () => ({ campaigns: new Map(), ads: new Map() }),
      previousStatuses: async (ids) => new Map(ids.filter((id) => saved.has(id)).map((id) => [id, saved.get(id)!.status])),
      previousApprovedAt: async () => new Map(),
      upsertOrders: async (rows) => {
        for (const r of rows) saved.set(r.platformOrderId, r);
      },
    };
    return s;
  }
  const run = (s: OrderStore, sales: KiwifySale[], lastSyncedAt: string | null) =>
    syncKiwifySales({ source: { sales: async () => sales }, store: s, auth: { token: 't', accountId: 'a' }, today: '2026-10-18', lastSyncedAt, now: NOW });

  it('primeira leitura não avisa; as seguintes avisam só o que mudou', async () => {
    const s = store();
    const pix = sale({ id: 'p1', status: 'waiting_payment', payment_method: 'pix', approved_date: null });
    expect((await run(s, [sale({ id: 'a1' }), pix], null)).events).toEqual([]);
    const second = await run(s, [sale({ id: 'a1' }), sale({ id: 'p1', payment_method: 'pix' }), sale({ id: 'n1' })], '2026-10-18T14:00:00.000Z');
    expect(second.events.map((e) => `${e.kind}:${e.orderId}`).sort()).toEqual(['venda_aprovada:n1', 'venda_aprovada:p1']);
  });
});
