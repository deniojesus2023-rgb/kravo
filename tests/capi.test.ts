import { describe, expect, it } from 'vitest';
import { buildCapiEvent } from '@/lib/capi/event';
import { CapiError, capiErrorKind, createCapi } from '@/lib/capi/graph';
import { buildUserData, normalizePhone } from '@/lib/capi/hash';
import { eventsToEnqueue, processQueue, RETRY_MINUTES, type CapiStore, type NewCapiRow, type PixelConfig, type QueueRow, type Settle } from '@/lib/capi/queue';
import type { OrderEvent } from '@/lib/notifications/events';

const NOW = new Date('2026-10-22T15:00:00Z');
const TOKEN = 'EAAG-segredo-do-token-123';
const sha = (s: string) => expect.stringMatching(/^[0-9a-f]{64}$/);

describe('hash dos dados do comprador', () => {
  it('normaliza e-mail, telefone e nome antes do hash, e nunca guarda dado em claro', () => {
    const d = buildUserData({ email: '  Maria@Exemplo.COM ', phone: '(11) 98888-7777', name: 'Maria  da Silva', zip: '01310-100', country: 'BR' });
    expect(d.em).toEqual(sha(''));
    expect(d.ph).toEqual(sha(''));
    expect(JSON.stringify(d)).not.toMatch(/maria|exemplo|98888|silva/i);
    expect(buildUserData({ email: 'maria@exemplo.com' }).em).toBe(d.em);
    expect(normalizePhone('(11) 98888-7777')).toBe('5511988887777');
  });
});

describe('evento da API de Conversões', () => {
  it('usa o ID do pedido como event_id, valor em reais e BRL', () => {
    const e = buildCapiEvent({ eventName: 'Purchase', orderId: 'ord-1', eventId: 'ord-1', eventTime: '2026-10-22T14:00:00Z', valueCents: 9790, userData: {}, offerName: 'Oferta', sourceUrl: null });
    expect(e).toMatchObject({ event_id: 'ord-1', action_source: 'website', custom_data: { value: 97.9, currency: 'BRL', order_id: 'ord-1' } });
    expect(e.event_time).toBe(Math.floor(Date.parse('2026-10-22T14:00:00Z') / 1000));
    expect(e.event_source_url).toMatch(/^https:\/\//);
  });
});

describe('envio ao Meta', () => {
  it('manda o token no corpo, inclui o código de teste e não vaza o token em erro', async () => {
    let seen: { url: string; body: Record<string, unknown> } | null = null;
    const ok = createCapi(async (url, init) => {
      seen = { url, body: JSON.parse(init!.body!) };
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'AbC123xyz' }), { status: 200 });
    }, 'v23.0');
    const e = buildCapiEvent({ eventName: 'Purchase', orderId: 'o', eventId: 'o', eventTime: NOW.toISOString(), valueCents: 100, userData: {}, offerName: 'x', sourceUrl: null });
    await ok.sendEvents({ pixelId: '123456789', token: TOKEN, events: [e], testEventCode: 'TEST123' });
    expect(seen!.url).toBe('https://graph.facebook.com/v23.0/123456789/events');
    expect(seen!.url).not.toContain(TOKEN);
    expect(seen!.body).toMatchObject({ access_token: TOKEN, test_event_code: 'TEST123' });

    const bad = createCapi(async () => new Response(JSON.stringify({ error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } }), { status: 400 }));
    const err = await bad.sendEvents({ pixelId: '123456789', token: TOKEN, events: [e] }).catch((x) => x);
    expect(err).toBeInstanceOf(CapiError);
    expect(String(err.message)).not.toContain(TOKEN);
    expect(capiErrorKind(err)).toBe('token_invalido');
  });

  it('classifica os erros', () => {
    expect(capiErrorKind(new CapiError('x', 17, 400))).toBe('limite');
    expect(capiErrorKind(new CapiError('x', null, 0))).toBe('temporario');
    expect(capiErrorKind(new CapiError('x', null, 503))).toBe('temporario');
    expect(capiErrorKind(new CapiError('x', 100, 400))).toBe('dados_invalidos');
  });
});

const order = (over: Partial<OrderEvent> = {}): OrderEvent => ({ kind: 'venda_aprovada', dedupeKey: 'k', orderId: 'ord-1', offerId: 'of-1', label: null, amountCents: 5000, paymentMethod: null, approvedAt: '2026-10-22T14:00:00Z', userData: { em: 'a'.repeat(64) }, ...over });
const on: PixelConfig = { offerId: 'of-1', pixelId: '123456789', enabled: true, testCode: null };

describe('o que entra na fila', () => {
  const run = (events: OrderEvent[], cfg: PixelConfig | null = on) => eventsToEnqueue({ userId: 'u', events, configs: new Map(cfg ? [[cfg.offerId, cfg]] : []), now: NOW });
  it('só venda aprovada, de oferta com envio ligado, e recente', () => {
    expect(run([order()])).toHaveLength(1);
    expect(run([order({ kind: 'pix_gerado' as OrderEvent['kind'] })])).toHaveLength(0);
    expect(run([order({ offerId: null })])).toHaveLength(0);
    expect(run([order()], { ...on, enabled: false })).toHaveLength(0);
    expect(run([order()], null)).toHaveLength(0);
    expect(run([order({ approvedAt: '2026-10-10T00:00:00Z' })])).toHaveLength(0);
  });
  it('marca como teste quando há código de teste', () => {
    expect(run([order()], { ...on, testCode: 'TEST1' })[0]!.test).toBe(true);
  });
});

function memoryStore(rows: NewCapiRow[], cfg: PixelConfig | null = on, token: string | null = TOKEN) {
  const queue: QueueRow[] = rows.map((r, i) => ({ ...r, id: `e${i}`, attempts: 0, createdAt: NOW.toISOString() }));
  const settled: Settle[] = [];
  const pixel: string[] = [];
  const store: CapiStore = {
    pixelConfigs: async () => new Map(cfg ? [[cfg.offerId, cfg]] : []),
    insertEvents: async () => undefined,
    due: async () => queue,
    offerInfo: async () => new Map([['of-1', { name: 'Oferta', checkoutUrl: null }]]),
    token: async () => token,
    settle: async (u) => void settled.push(...u),
    setPixelStatus: async (_u, _o, s) => void pixel.push(s),
  };
  return { store, settled, pixel };
}
const row = (over: Partial<NewCapiRow> = {}): NewCapiRow => ({ userId: 'u', offerId: 'of-1', platformOrderId: 'ord-1', eventName: 'Purchase', eventId: 'ord-1', eventTime: '2026-10-22T14:00:00Z', valueCents: 5000, userData: {}, test: false, ...over });

describe('processar a fila', () => {
  it('envia e marca como enviado', async () => {
    const m = memoryStore([row()]);
    const sent: string[] = [];
    const r = await processQueue({ store: m.store, now: NOW, send: async (i) => (sent.push(i.events[0]!.event_id), { eventsReceived: 1, fbtraceId: null }) });
    expect(r.sent).toBe(1);
    expect(sent).toEqual(['ord-1']);
    expect(m.settled[0]).toMatchObject({ status: 'enviado', attempts: 1 });
    expect(m.pixel).toEqual(['ok']);
  });
  it('erro temporário reagenda com espera crescente e desiste ao esgotar', async () => {
    const m = memoryStore([row()]);
    await processQueue({ store: m.store, now: NOW, send: async () => { throw new CapiError('x', null, 503); } });
    expect(m.settled[0]).toMatchObject({ status: 'pendente', attempts: 1, nextAttemptAt: new Date(NOW.getTime() + RETRY_MINUTES[0]! * 60_000).toISOString() });
    const last = memoryStore([row()]);
    (await last.store.due(null, NOW, 1))[0]!.attempts = RETRY_MINUTES.length - 1;
    await processQueue({ store: last.store, now: NOW, send: async () => { throw new CapiError('x', null, 503); } });
    expect(last.settled[0]).toMatchObject({ status: 'erro', error: 'tentativas_esgotadas' });
  });
  it('token recusado marca o pixel e não tenta de novo', async () => {
    const m = memoryStore([row()]);
    await processQueue({ store: m.store, now: NOW, send: async () => { throw new CapiError('x', 190, 400); } });
    expect(m.settled[0]).toMatchObject({ status: 'erro', error: 'token_invalido' });
    expect(m.pixel).toEqual(['token_invalido']);
  });
  it('descarta o que ficou velho ou com envio desligado, sem chamar o Meta', async () => {
    let calls = 0;
    const send = async () => (calls++, { eventsReceived: 1, fbtraceId: null });
    const old = memoryStore([row({ eventTime: '2026-10-01T00:00:00Z' })]);
    await processQueue({ store: old.store, now: NOW, send });
    const off = memoryStore([row()], { ...on, enabled: false });
    await processQueue({ store: off.store, now: NOW, send });
    expect([old.settled[0]!.status, off.settled[0]!.status]).toEqual(['descartado', 'descartado']);
    expect(calls).toBe(0);
  });
  it('sem token guardado, falha sem chamar o Meta', async () => {
    const m = memoryStore([row()], on, null);
    const r = await processQueue({ store: m.store, now: NOW, send: async () => { throw new Error('não deveria'); } });
    expect(r.failed).toBe(1);
    expect(m.settled[0]).toMatchObject({ error: 'sem_token' });
  });
});
