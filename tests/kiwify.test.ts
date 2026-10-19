import { describe, expect, it, vi } from 'vitest';
import { createKiwify, KIWIFY_BASE, KiwifyApiError, WEBHOOK_TRIGGERS, type KiwifySale } from '@/lib/kiwify/client';
import { mapSale, metaIdsIn } from '@/lib/kiwify/orders';
import { kiwifyErrorCode, runKiwifySync, type KiwifyRunDb } from '@/lib/kiwify/run';
import { planSalesWindow, syncKiwifySales, type OrderStore, type OrderUpsert } from '@/lib/kiwify/sync';
import { handleKiwifyWebhook, hashWebhookSecret, newWebhookSecret } from '@/lib/kiwify/webhook';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const sale = (over: Partial<KiwifySale> = {}): KiwifySale => ({
  id: 'ord-1',
  status: 'paid',
  created_at: '2026-10-17T15:00:00.000Z',
  updated_at: '2026-10-17T15:05:00.000Z',
  approved_date: '2026-10-17T15:01:00.000Z',
  product: { id: 'prod-vasos', name: 'Vasos' },
  payment: { charge_amount: 14990, charge_currency: 'BRL', net_amount: 12000, fee: 2990 },
  tracking: { utm_campaign: 'VASOS_CBO|120210000000001', utm_content: 'AD|120210000000009', utm_source: 'fb' },
  ...over,
});

describe('cliente da Kiwify: só o que a documentação prevê', () => {
  it('token: POST /oauth/token com formulário; sem token nem segredo na URL', async () => {
    const calls: Array<{ url: string; init: Record<string, unknown> | undefined }> = [];
    const kiwify = createKiwify(async (url, init) => {
      calls.push({ url, init: init as never });
      return json({ access_token: 'tok', expires_in: 86400 });
    });
    const t = await kiwify.token('cid-123456', 'segredo-super-secreto-123');
    expect(t).toEqual({ accessToken: 'tok', expiresInSeconds: 86400 });
    expect(calls[0]!.url).toBe(`${KIWIFY_BASE}/oauth/token`);
    expect(calls[0]!.init).toMatchObject({ method: 'POST' });
    expect(String(calls[0]!.init!.body)).toBe('client_id=cid-123456&client_secret=segredo-super-secreto-123');
    expect(calls[0]!.url).not.toContain('segredo');
  });

  it('chamadas autenticadas levam Bearer e x-kiwify-account-id; vendas pedem os detalhes completos', async () => {
    const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
    const kiwify = createKiwify(async (url, init) => {
      calls.push({ url: new URL(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return json({ data: [] });
    });
    await kiwify.sales({ token: 'tok', accountId: 'acc123' }, '2026-07-21', '2026-10-18', '2026-10-17');
    await kiwify.products({ token: 'tok', accountId: 'acc123' });
    expect(calls[0]!.url.pathname).toBe('/v1/sales');
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      start_date: '2026-07-21',
      end_date: '2026-10-18',
      updated_at_start_date: '2026-10-17',
      view_full_sale_details: 'true',
      page_number: '1',
    });
    expect(calls[0]!.headers).toMatchObject({ Authorization: 'Bearer tok', 'x-kiwify-account-id': 'acc123' });
    expect(calls[1]!.url.pathname).toBe('/v1/products');
    for (const c of calls) expect(c.url.host).toBe('public-api.kiwify.com');
  });

  it('percorre as páginas até vir uma página incompleta', async () => {
    const pagesAsked: string[] = [];
    const kiwify = createKiwify(async (url) => {
      const n = new URL(url).searchParams.get('page_number')!;
      pagesAsked.push(n);
      return json({ data: Array.from({ length: n === '1' ? 100 : 3 }, (_, i) => ({ id: `${n}-${i}` })) });
    });
    const all = await kiwify.sales({ token: 't', accountId: 'a' }, '2026-07-21', '2026-10-18');
    expect(all).toHaveLength(103);
    expect(pagesAsked).toEqual(['1', '2']);
  });

  it('webhook: nome, URL, todos os produtos e só os eventos escolhidos', async () => {
    let body: Record<string, unknown> = {};
    const kiwify = createKiwify(async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return json({ id: 'wh-1' });
    });
    expect(await kiwify.createWebhook({ token: 't', accountId: 'a' }, { name: 'trakfy', url: 'https://app/x', token: 'seg' })).toEqual({ id: 'wh-1' });
    expect(body).toMatchObject({ name: 'trakfy', url: 'https://app/x', products: 'all', triggers: [...WEBHOOK_TRIGGERS] });
    expect(WEBHOOK_TRIGGERS).toEqual(expect.arrayContaining(['compra_aprovada', 'compra_reembolsada', 'chargeback']));
  });

  it('erros: só status e código curtos; nunca eco de segredo', async () => {
    const kiwify = createKiwify(async () => json({ error: 'auth_error', message: 'Invalid client: client is invalid' }, 400));
    const error = await kiwify.token('cid-123456', 'segredo-super-secreto-123').catch((e) => e as KiwifyApiError);
    expect(error).toBeInstanceOf(KiwifyApiError);
    expect(error).toMatchObject({ status: 400, code: 'auth_error' });
    const net = await createKiwify(async () => {
      throw new Error('ECONNRESET https://x?client_secret=segredo');
    })
      .token('a', 'b')
      .catch((e) => e as KiwifyApiError) as KiwifyApiError;
    expect(net.message).not.toContain('segredo');
    expect(net.status).toBe(0);
  });
});

describe('mapSale: venda da Kiwify → pedido', () => {
  const ok = (s: KiwifySale) => {
    const r = mapSale(s);
    if (!r.ok) throw new Error(`ignorada: ${r.reason}`);
    return r.order;
  };

  it('paga vira aprovado, em centavos, com UTMs', () => {
    expect(ok(sale())).toMatchObject({
      platformOrderId: 'ord-1',
      productId: 'prod-vasos',
      status: 'aprovado',
      amountCents: 14990,
      refundedCents: 0,
      approvedAt: '2026-10-17T15:01:00.000Z',
      refundedAt: null,
      utm: { source: 'fb', campaign: 'VASOS_CBO|120210000000001', content: 'AD|120210000000009', medium: null },
    });
  });

  it('reembolso e chargeback devolvem o valor todo e mantêm a data de aprovação', () => {
    const refunded = ok(sale({ status: 'refunded', refunded_at: '2026-10-18T10:00:00.000Z' }));
    expect(refunded).toMatchObject({ status: 'reembolsado', refundedCents: 14990, approvedAt: '2026-10-17T15:01:00.000Z', refundedAt: '2026-10-18T10:00:00.000Z' });
    expect(ok(sale({ status: 'chargedback', refunded_at: null }))).toMatchObject({ status: 'chargeback', refundedCents: 14990, refundedAt: '2026-10-17T15:05:00.000Z' });
  });

  it('pedido de reembolso ainda não concluído continua aprovado; pendentes e recusadas não têm data de aprovação', () => {
    expect(ok(sale({ status: 'refund_requested' })).status).toBe('aprovado');
    for (const status of ['waiting_payment', 'pending', 'processing', 'authorized']) {
      expect(ok(sale({ status, approved_date: null }))).toMatchObject({ status: 'pendente', approvedAt: null });
    }
    expect(ok(sale({ status: 'refused', approved_date: null }))).toMatchObject({ status: 'cancelado', approvedAt: null });
  });

  it('sem approved_date, a data de criação vale (o banco exige data para aprovado)', () => {
    expect(ok(sale({ approved_date: null })).approvedAt).toBe('2026-10-17T15:00:00.000Z');
  });

  it('nunca inventa: outra moeda, sem valor, sem id ou status novo são ignorados com o motivo', () => {
    const reason = (s: KiwifySale) => {
      const r = mapSale(s);
      return r.ok ? 'ok' : r.reason;
    };
    expect(reason(sale({ payment: { charge_amount: 100, charge_currency: 'USD' } }))).toBe('moeda');
    expect(reason(sale({ payment: undefined }))).toBe('sem_valor');
    expect(reason(sale({ id: undefined }))).toBe('sem_id');
    expect(reason(sale({ status: 'algo_novo' }))).toBe('status_desconhecido');
  });

  it('ids numéricos longos dentro da UTM', () => {
    expect(metaIdsIn('VASOS_CBO|120210000000001')).toEqual(['120210000000001']);
    expect(metaIdsIn('120210000000001')).toEqual(['120210000000001']);
    expect(metaIdsIn('teste')).toEqual([]);
    expect(metaIdsIn(null)).toEqual([]);
  });
});

function fakeStore(offers: Record<string, string> = { 'prod-vasos': 'o1' }, campaigns: Record<string, string> = { '120210000000001': 'c1' }, ads: Record<string, string> = { '120210000000009': 'ad1' }) {
  const saved = new Map<string, OrderUpsert>();
  const store: OrderStore = {
    offerIdsByProduct: async () => new Map(Object.entries(offers)),
    metaEntities: async () => ({ campaigns: new Map(Object.entries(campaigns)), ads: new Map(Object.entries(ads)) }),
    upsertOrders: async (rows) => {
      for (const r of rows) saved.set(r.platformOrderId, r);
    },
  };
  return { store, saved };
}

describe('syncKiwifySales', () => {
  const auth = { token: 't', accountId: 'a' };

  it('liga o pedido à oferta pelo produto e à campanha e ao anúncio pelas UTMs', async () => {
    const { store, saved } = fakeStore();
    const r = await syncKiwifySales({ source: { sales: async () => [sale()] }, store, auth, today: '2026-10-18', lastSyncedAt: null });
    expect(r).toMatchObject({ fetched: 1, saved: 1, semOferta: 0 });
    expect(saved.get('ord-1')).toMatchObject({ offerId: 'o1', campaignId: 'c1', adId: 'ad1', status: 'aprovado' });
  });

  it('produto sem oferta não vira pedido (e é contado); UTM desconhecida deixa campanha e anúncio vazios', async () => {
    const { store, saved } = fakeStore({ 'prod-vasos': 'o1' }, {}, {});
    const r = await syncKiwifySales({
      source: { sales: async () => [sale(), sale({ id: 'ord-2', product: { id: 'outro' } }), sale({ id: 'ord-3', payment: { charge_amount: 1, charge_currency: 'USD' } })] },
      store,
      auth,
      today: '2026-10-18',
      lastSyncedAt: null,
    });
    expect(r).toMatchObject({ fetched: 3, saved: 1, semOferta: 1, ignoradas: { moeda: 1 } });
    expect(saved.get('ord-1')).toMatchObject({ campaignId: null, adId: null });
    expect(saved.has('ord-2')).toBe(false);
  });

  it('rodar de novo não duplica e atualiza o estado (aprovado → reembolsado)', async () => {
    const { store, saved } = fakeStore();
    const run = (s: KiwifySale) => syncKiwifySales({ source: { sales: async () => [s] }, store, auth, today: '2026-10-18', lastSyncedAt: null });
    await run(sale());
    await run(sale({ status: 'refunded', refunded_at: '2026-10-18T09:00:00.000Z' }));
    expect(saved.size).toBe(1);
    expect(saved.get('ord-1')).toMatchObject({ status: 'reembolsado', refundedCents: 14990 });
  });

  it('janela: 90 dias na primeira vez; depois só o que mudou, sem sair da janela', () => {
    expect(planSalesWindow('2026-10-18', null)).toEqual({ start: '2026-07-21', end: '2026-10-18' });
    expect(planSalesWindow('2026-10-18', '2026-10-17T12:00:00.000Z')).toEqual({ start: '2026-07-21', end: '2026-10-18', updatedSince: '2026-10-16' });
    expect(planSalesWindow('2026-10-18', '2026-01-01T00:00:00.000Z').updatedSince).toBe('2026-07-21');
  });
});

describe('runKiwifySync', () => {
  const creds = { clientId: 'cid-123456', clientSecret: 'segredo-super-secreto-123', accountId: 'acc123' };
  const dbOf = (over: Partial<KiwifyRunDb> = {}) => {
    const recordRun = vi.fn(async () => {});
    const markError = vi.fn(async () => {});
    const markSynced = vi.fn(async () => {});
    const db: KiwifyRunDb = {
      connection: async () => ({ id: 'conn', lastSyncedAt: null, credentials: creds }),
      lastRunStartedAt: async () => null,
      recordRun,
      markError,
      markSynced,
      storeFor: () => fakeStore().store,
      ...over,
    };
    return { db, recordRun, markError, markSynced };
  };
  const now = new Date('2026-10-18T15:00:00Z');
  const kiwify = (sales: KiwifySale[] = [sale()]) => ({ token: vi.fn(async () => ({ accessToken: 't', expiresInSeconds: 1 })), sales: vi.fn(async () => sales) });

  it('sucesso: grava a leitura e registra a execução sem erro', async () => {
    const { db, recordRun, markSynced } = dbOf();
    const out = await runKiwifySync({ userId: 'u', kiwify: kiwify(), db, now });
    expect(out).toEqual({ ok: true, fetched: 1, saved: 1, semOferta: 0 });
    expect(markSynced).toHaveBeenCalledWith('u', 'conn', now.toISOString());
    expect(recordRun).toHaveBeenCalledWith('u', expect.objectContaining({ ok: true, error: null }));
  });

  it('credencial recusada marca a conexão com erro e registra só o código fixo', async () => {
    const { db, markError, recordRun } = dbOf();
    const k = { token: vi.fn(async () => { throw new KiwifyApiError('Invalid client: segredo-super-secreto-123', 400, 'auth_error'); }), sales: vi.fn() };
    const out = await runKiwifySync({ userId: 'u', kiwify: k, db, now });
    expect(out).toEqual({ ok: false, code: 'credencial_invalida' });
    expect(markError).toHaveBeenCalledWith('u', 'conn');
    expect(JSON.stringify(recordRun.mock.calls)).not.toContain('segredo');
  });

  it('códigos de erro, sem conexão e intervalo mínimo', async () => {
    expect(kiwifyErrorCode(new KiwifyApiError('x', 429))).toBe('limite_da_kiwify');
    expect(kiwifyErrorCode(new KiwifyApiError('x', 400, 'validation_error'))).toBe('kiwify_erro');
    expect(kiwifyErrorCode(new KiwifyApiError('x', 500))).toBe('kiwify_erro');
    expect(kiwifyErrorCode(new Error('banco'))).toBe('banco');
    expect(await runKiwifySync({ userId: 'u', kiwify: kiwify(), db: dbOf({ connection: async () => null }).db, now })).toEqual({ ok: false, code: 'sem_conexao' });
    const recent = dbOf({ lastRunStartedAt: async () => '2026-10-18T14:59:30Z' }).db;
    expect(await runKiwifySync({ userId: 'u', kiwify: kiwify(), db: recent, now, minIntervalSeconds: 120 })).toEqual({ ok: false, code: 'muito_recente' });
  });
});

describe('webhook da Kiwify', () => {
  const setup = (known: string | null) => {
    const sync = vi.fn(async () => ({ ok: true as const, fetched: 0, saved: 0, semOferta: 0 }));
    const tasks: Array<() => Promise<unknown>> = [];
    const deps = { findUserByHash: vi.fn(async (hash: string) => (known && hash === hashWebhookSecret(known) ? 'user-1' : null)), sync, defer: (t: () => Promise<unknown>) => void tasks.push(t) };
    return { deps, sync, tasks };
  };

  it('segredo válido: responde 200 e lê as vendas do dono depois; o corpo é ignorado', async () => {
    const secret = newWebhookSecret();
    const { deps, sync, tasks } = setup(secret);
    expect(await handleKiwifyWebhook(secret, deps)).toEqual({ status: 200 });
    expect(sync).not.toHaveBeenCalled(); // só depois da resposta
    await tasks[0]!();
    expect(sync).toHaveBeenCalledWith('user-1');
  });

  it('segredo desconhecido ou malformado: 404 igual nos dois casos, sem ler nada', async () => {
    const { deps, sync, tasks } = setup(newWebhookSecret());
    expect(await handleKiwifyWebhook(newWebhookSecret(), deps)).toEqual({ status: 404 });
    expect(await handleKiwifyWebhook('curto', deps)).toEqual({ status: 404 });
    expect(await handleKiwifyWebhook("'; drop table orders; --'''''''''''''''", deps)).toEqual({ status: 404 });
    expect(tasks).toHaveLength(0);
    expect(sync).not.toHaveBeenCalled();
  });

  it('um erro na leitura não vira erro para a Kiwify', async () => {
    const secret = newWebhookSecret();
    const { deps, tasks } = setup(secret);
    deps.sync.mockRejectedValueOnce(new Error('falhou'));
    await handleKiwifyWebhook(secret, deps);
    await expect(tasks[0]!()).resolves.toBeUndefined();
  });

  it('o segredo tem entropia alta e só o hash é guardado', () => {
    const a = newWebhookSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newWebhookSecret()).not.toBe(a);
    expect(hashWebhookSecret(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashWebhookSecret(a)).not.toContain(a);
  });
});
