import { describe, expect, it, vi } from 'vitest';
import { createGraph, MetaApiError } from '@/lib/meta/graph';
import {
  AD_FIELDS,
  ADSET_FIELDS,
  ATTRIBUTION_WINDOW,
  CAMPAIGN_FIELDS,
  INSIGHT_FIELDS_BY_LEVEL,
  INSIGHT_FIELDS,
  dailyBudgetCents,
  parseInsightRow,
  planWindow,
} from '@/lib/meta/insights';
import { errorCodeOf, planRunRecord, runMetaSync, type RunDb } from '@/lib/meta/run';
import { claimRefresh, shouldRefresh } from '@/lib/meta/refresh';
import { syncAdAccount, type CampaignRecord, type MetricUpsert, type SyncStore } from '@/lib/meta/sync';
import type { MetaEnv } from '@/lib/meta/config';

const env: MetaEnv = { appId: '123456', appSecret: 'segredo-do-app-0123456789abcdef', configId: null, graphVersion: 'v23.0' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('insights: leitura dos números da Meta', () => {
  it('converte gasto em centavos e usa a janela de atribuição pedida', () => {
    const r = parseInsightRow({
      campaign_id: '9',
      campaign_name: 'VASOS_CBO',
      date_start: '2026-10-18',
      spend: '123.45',
      impressions: '1000',
      reach: '800',
      inline_link_clicks: '40',
      actions: [
        { action_type: 'landing_page_view', value: '30' },
        { action_type: 'initiate_checkout', value: '9' },
        { action_type: 'purchase', value: '5', [ATTRIBUTION_WINDOW]: '3' },
        { action_type: 'omni_purchase', value: '5' },
      ],
      action_values: [{ action_type: 'purchase', value: '500.10', [ATTRIBUTION_WINDOW]: '300.50' }],
    });
    expect(r).toMatchObject({
      spendCents: 12345,
      impressions: 1000,
      landingPageViews: 30,
      checkouts: 9,
      purchases: 3, // não soma purchase com omni_purchase
      purchaseValueCents: 30050,
    });
  });

  it('linha sem campanha ou com data inválida é descartada; ausentes viram zero, nunca inventados', () => {
    expect(parseInsightRow({ date_start: '2026-10-18' })).toBeNull();
    expect(parseInsightRow({ campaign_id: '1', date_start: 'ontem' })).toBeNull();
    expect(parseInsightRow({ campaign_id: '1', date_start: '2026-10-18' })).toMatchObject({ spendCents: 0, purchases: 0, purchaseValueCents: 0 });
  });

  it('orçamento diário e janela', () => {
    expect(dailyBudgetCents('20000')).toBe(20000);
    expect(dailyBudgetCents(undefined)).toBeNull();
    expect(planWindow('2026-10-19', true)).toEqual({ since: '2026-09-20', until: '2026-10-19' });
    expect(planWindow('2026-10-19', false)).toEqual({ since: '2026-10-13', until: '2026-10-19' });
  });
});

describe('Graph: só campos permitidos com ads_read', () => {
  it('campanhas e insights pedem exatamente as listas fixas, sem expansão', async () => {
    const urls: URL[] = [];
    const graph = createGraph(env, async (raw) => {
      urls.push(new URL(raw));
      return json({ data: [] });
    });
    await graph.campaigns('tok', 'act_1');
    await graph.campaignInsights('tok', 'act_1', '2026-10-01', '2026-10-19');
    await graph.adsets('tok', 'act_1');
    await graph.ads('tok', 'act_1');
    await graph.insights('tok', 'act_1', 'adset', '2026-10-01', '2026-10-19');
    await graph.insights('tok', 'act_1', 'ad', '2026-10-01', '2026-10-19');
    expect(urls.map((u) => u.pathname)).toEqual([
      '/v23.0/act_1/campaigns',
      '/v23.0/act_1/insights',
      '/v23.0/act_1/adsets',
      '/v23.0/act_1/ads',
      '/v23.0/act_1/insights',
      '/v23.0/act_1/insights',
    ]);
    expect(urls[2]!.searchParams.get('fields')).toBe(ADSET_FIELDS.join(','));
    expect(urls[3]!.searchParams.get('fields')).toBe(AD_FIELDS.join(','));
    expect(urls[4]!.searchParams.get('level')).toBe('adset');
    expect(urls[5]!.searchParams.get('fields')).toBe(INSIGHT_FIELDS_BY_LEVEL.ad.join(','));
    for (const u of urls) expect(u.searchParams.get('fields')).not.toMatch(/[{}()]/);
    expect(urls[0]!.searchParams.get('fields')).toBe(CAMPAIGN_FIELDS.join(','));
    expect(urls[1]!.searchParams.get('fields')).toBe(INSIGHT_FIELDS.join(','));
    expect(urls[1]!.searchParams.get('level')).toBe('campaign');
    expect(urls[1]!.searchParams.get('time_increment')).toBe('1');
    for (const u of urls) {
      expect(u.searchParams.get('fields')).not.toMatch(/[{}()]/);
      expect(u.searchParams.has('scope')).toBe(false);
    }
    for (const forbidden of ['business', 'account_name', 'actions_by_breakdown', 'adset_id', 'ad_id']) {
      expect([...INSIGHT_FIELDS, ...CAMPAIGN_FIELDS]).not.toContain(forbidden);
    }
  });

  it('percorre as páginas pelo cursor', async () => {
    const afters: Array<string | null> = [];
    const graph = createGraph(env, async (raw) => {
      const u = new URL(raw);
      afters.push(u.searchParams.get('after'));
      return u.searchParams.get('after')
        ? json({ data: [{ id: '2', name: 'B' }] })
        : json({ data: [{ id: '1', name: 'A' }], paging: { cursors: { after: 'c1' }, next: 'x' } });
    });
    expect((await graph.campaigns('tok', 'act_1')).map((c) => c.id)).toEqual(['1', '2']);
    expect(afters).toEqual([null, 'c1']);
  });
});

/** Campanha que o usuário já ligou à oferta o1 (em Nova oferta). */
const LINKED: CampaignRecord[] = [{ id: 'cx', metaCampaignId: '10', offerId: 'o1' }];

function fakeStore(initial: CampaignRecord[] = []) {
  const campaigns = new Map(initial.map((c) => [c.metaCampaignId, { ...c }]));
  const metrics = new Map<string, MetricUpsert>();
  const adsets = new Map<string, string>();
  const ads = new Map<string, string>();
  let n = 0;
  const store: SyncStore = {
    campaignsOfAccount: async () => [...campaigns.values()],
    upsertCampaigns: async (_acc, rows) =>
      rows.map((r) => {
        const prev = campaigns.get(r.metaCampaignId);
        const rec = { id: prev?.id ?? `c${++n}`, metaCampaignId: r.metaCampaignId, offerId: r.offerId };
        campaigns.set(r.metaCampaignId, rec);
        return rec;
      }),
    upsertAdsets: async (rows) =>
      rows.map((r) => {
        const id = adsets.get(r.metaAdsetId) ?? `s${++n}`;
        adsets.set(r.metaAdsetId, id);
        return { id, metaId: r.metaAdsetId };
      }),
    upsertAds: async (rows) =>
      rows.map((r) => {
        const id = ads.get(r.metaAdId) ?? `a${++n}`;
        ads.set(r.metaAdId, id);
        return { id, metaId: r.metaAdId };
      }),
    upsertMetrics: async (rows) => {
      for (const r of rows) metrics.set(`${r.level}|${r.entityId}|${r.date}`, r);
    },
  };
  return { store, campaigns, metrics, adsets, ads };
}

interface Extra {
  adsets?: object[];
  ads?: object[];
  adsetInsights?: object[];
  adInsights?: object[];
}
const graphOf = (insights: object[], campaigns = [{ id: '10', name: 'VASOS_CBO', effective_status: 'ACTIVE', daily_budget: '20000' }, { id: '11', name: 'Teste solto' }], extra: Extra = {}) => ({
  campaigns: vi.fn(async () => campaigns),
  adsets: vi.fn(async () => (extra.adsets ?? []) as never[]),
  ads: vi.fn(async () => (extra.ads ?? []) as never[]),
  insights: vi.fn(async (_t: string, _a: string, level: string) =>
    ((level === 'campaign' ? insights : level === 'adset' ? extra.adsetInsights : extra.adInsights) ?? []) as never[],
  ),
});

const row = (id: string, date: string, spend: string) => ({ campaign_id: id, campaign_name: id, date_start: date, spend });
const account = { id: 'a1', metaAccountId: 'act_1', currency: 'BRL' };
const now = new Date('2026-10-19T15:00:00Z');

describe('syncAdAccount', () => {
  it('só campanhas ligadas pelo usuário guardam métricas; as novas ficam sem oferta', async () => {
    const { store, metrics } = fakeStore(LINKED);
    const r = await syncAdAccount({ graph: graphOf([row('10', '2026-10-18', '10'), row('11', '2026-10-18', '5')]), store, token: 't', account, today: '2026-10-19', now });
    expect(r).toMatchObject({ campaigns: 2, linked: 1, unlinked: 1, metricRows: 1, adsets: 0, ads: 0 });
    expect([...metrics.values()][0]!).toMatchObject({ offerId: 'o1', spendCents: 1000 });
  });

  it('rodar duas vezes não duplica (idempotente) e atualiza os valores', async () => {
    const { store, metrics, campaigns } = fakeStore(LINKED);
    const run = (spend: string) => syncAdAccount({ graph: graphOf([row('10', '2026-10-18', spend)]), store, token: 't', account, today: '2026-10-19', now });
    await run('10');
    await run('12');
    expect(metrics.size).toBe(1);
    expect(campaigns.size).toBe(2);
    expect([...metrics.values()][0]!.spendCents).toBe(1200);
  });

  it('a sincronização nunca liga uma campanha a uma oferta pelo nome', async () => {
    const { store, metrics } = fakeStore();
    const g = graphOf([row('10', '2026-10-18', '10')], [{ id: '10', name: 'VASOS_CBO_ESCALA', effective_status: 'ACTIVE', daily_budget: '20000' }]);
    const r = await syncAdAccount({ graph: g, store, token: 't', account, today: '2026-10-19', now });
    expect(r).toMatchObject({ campaigns: 1, linked: 0, unlinked: 1, metricRows: 0 });
    expect(metrics.size).toBe(0);
  });

  it('o vínculo escolhido pelo usuário é mantido', async () => {
    const { store } = fakeStore([{ id: 'cx', metaCampaignId: '10', offerId: 'o2' }]);
    const g = graphOf([row('10', '2026-10-18', '10')]);
    await syncAdAccount({ graph: g, store, token: 't', account, today: '2026-10-19', now });
    const saved = await store.campaignsOfAccount('a1');
    expect(saved.find((c) => c.metaCampaignId === '10')?.offerId).toBe('o2');
  });

  it('primeira vez pede 30 dias; depois 7', async () => {
    const first = graphOf([]);
    await syncAdAccount({ graph: first, store: fakeStore().store, token: 't', account, today: '2026-10-19', now });
    expect(first.insights).toHaveBeenCalledWith('t', 'act_1', 'campaign', '2026-09-20', '2026-10-19');
    const next = graphOf([]);
    await syncAdAccount({ graph: next, store: fakeStore([{ id: 'c', metaCampaignId: '10', offerId: null }]).store, token: 't', account, today: '2026-10-19', now });
    expect(next.insights).toHaveBeenCalledWith('t', 'act_1', 'campaign', '2026-10-13', '2026-10-19');
  });

  it('conjuntos e anúncios: só de campanhas ligadas, com vídeo 3s, sem duplicar nem afetar o nível campanha', async () => {
    const { store, metrics, adsets, ads } = fakeStore(LINKED);
    const adsetRow = { campaign_id: '10', adset_id: '20', adset_name: 'CJ1', date_start: '2026-10-18', spend: '6', actions: [{ action_type: 'video_view', value: '40' }] };
    const adRow = { campaign_id: '10', adset_id: '20', ad_id: '30', ad_name: 'AD1', date_start: '2026-10-18', spend: '4', impressions: '100', actions: [{ action_type: 'video_view', value: '25' }] };
    const loose = { campaign_id: '11', adset_id: '21', adset_name: 'solto', date_start: '2026-10-18', spend: '1' };
    const g = graphOf([row('10', '2026-10-18', '10')], undefined, {
      adsets: [{ id: '20', name: 'CJ1', effective_status: 'ACTIVE', campaign_id: '10' }, { id: '21', name: 'solto', campaign_id: '11' }],
      ads: [{ id: '30', name: 'AD1', effective_status: 'PAUSED', adset_id: '20', campaign_id: '10' }],
      adsetInsights: [adsetRow, loose],
      adInsights: [adRow],
    });
    const run = () => syncAdAccount({ graph: g, store, token: 't', account, today: '2026-10-19', now });
    const r = await run();
    await run();
    expect(r).toMatchObject({ adsets: 1, ads: 1, metricRows: 3 });
    expect(adsets.size).toBe(1);
    expect(ads.size).toBe(1);
    expect(metrics.size).toBe(3);
    const ad = [...metrics.values()].find((m) => m.level === 'ad')!;
    expect(ad).toMatchObject({ offerId: 'o1', videoViews3s: 25, spendCents: 400, impressions: 100 });
    expect([...metrics.values()].filter((m) => m.level === 'campaign')).toHaveLength(1);
  });

  it('recusa conta que não é BRL', async () => {
    await expect(syncAdAccount({ graph: graphOf([]), store: fakeStore().store, token: 't', account: { ...account, currency: 'USD' }, today: '2026-10-19', now })).rejects.toThrow('moeda_nao_suportada');
  });
});

describe('runMetaSync', () => {
  const dbOf = (over: Partial<RunDb> = {}) => {
    const recordRun = vi.fn(async () => {});
    const markDisconnected = vi.fn(async () => {});
    const db: RunDb = {
      connection: async () => ({ id: 'conn', expiresAt: '2026-12-17T00:00:00Z', token: 'tok', accounts: [account] }),
      lastRunStartedAt: async () => null,
      recordRun,
      markDisconnected,
      storeFor: () => fakeStore(LINKED).store,
      ...over,
    };
    return { db, recordRun, markDisconnected };
  };

  it('sucesso registra a execução sem erro', async () => {
    const { db, recordRun } = dbOf();
    const out = await runMetaSync({ userId: 'u', graph: graphOf([row('10', '2026-10-18', '10')]), db, now });
    expect(out).toMatchObject({ ok: true, accounts: 1, linked: 1 });
    expect(recordRun).toHaveBeenCalledWith('u', expect.objectContaining({ ok: true, error: null }));
  });

  it('token recusado (190) desconecta e registra só o código fixo', async () => {
    const { db, recordRun, markDisconnected } = dbOf();
    const graph = { ...graphOf([]), campaigns: async () => { throw new MetaApiError('Error validating access token: token-secreto-muito-longo-123456', 190, 400); } };
    const out = await runMetaSync({ userId: 'u', graph, db, now });
    expect(out).toEqual({ ok: false, code: 'token_invalido' });
    expect(markDisconnected).toHaveBeenCalledWith('u', 'conn');
    expect(JSON.stringify(recordRun.mock.calls)).not.toContain('token-secreto');
    expect(recordRun).toHaveBeenCalledWith('u', expect.objectContaining({ ok: false, error: 'token_invalido' }));
  });

  it('limite de uso, expirada, sem contas e intervalo mínimo', async () => {
    expect(errorCodeOf(new MetaApiError('x', 17, 400))).toBe('limite_da_meta');
    expect(errorCodeOf(new Error('qualquer'))).toBe('banco');
    expect((await runMetaSync({ userId: 'u', graph: graphOf([]), db: dbOf({ connection: async () => null }).db, now }))).toEqual({ ok: false, code: 'sem_conexao' });
    const expired = dbOf({ connection: async () => ({ id: 'c', expiresAt: '2026-10-01T00:00:00Z', token: 't', accounts: [account] }) }).db;
    expect(await runMetaSync({ userId: 'u', graph: graphOf([]), db: expired, now })).toEqual({ ok: false, code: 'expirada' });
    const none = dbOf({ connection: async () => ({ id: 'c', expiresAt: null, token: 't', accounts: [] }) }).db;
    expect(await runMetaSync({ userId: 'u', graph: graphOf([]), db: none, now })).toEqual({ ok: false, code: 'sem_contas' });
    const recent = dbOf({ lastRunStartedAt: async () => '2026-10-19T14:59:00Z' }).db;
    expect(await runMetaSync({ userId: 'u', graph: graphOf([]), db: recent, now, minIntervalSeconds: 120 })).toEqual({ ok: false, code: 'muito_recente' });
  });
});

describe('leitura leve (a cada poucos minutos)', () => {
  const light = (store: SyncStore, g = graphOf([row('10', '2026-10-19', '12')])) =>
    syncAdAccount({ graph: g, store, token: 't', account, today: '2026-10-19', now, light: true });

  it('janela é só hoje', () => {
    expect(planWindow('2026-10-19', false, true)).toEqual({ since: '2026-10-19', until: '2026-10-19' });
    expect(planWindow('2026-10-19', true, true)).toEqual({ since: '2026-10-19', until: '2026-10-19' });
  });

  it('uma única chamada à Meta (insights de campanha de hoje); não lista nem cria campanhas, conjuntos ou anúncios', async () => {
    const { store, metrics, campaigns, adsets, ads } = fakeStore(LINKED);
    const g = graphOf([row('10', '2026-10-19', '12'), row('11', '2026-10-19', '5')]);
    const r = await light(store, g);
    expect(g.insights).toHaveBeenCalledTimes(1);
    expect(g.insights).toHaveBeenCalledWith('t', 'act_1', 'campaign', '2026-10-19', '2026-10-19');
    expect(g.campaigns).not.toHaveBeenCalled();
    expect(g.adsets).not.toHaveBeenCalled();
    expect(g.ads).not.toHaveBeenCalled();
    expect(r).toMatchObject({ campaigns: 1, linked: 1, unlinked: 0, metricRows: 1, adsets: 0, ads: 0 });
    expect(campaigns.size).toBe(1); // a campanha 11 (sem oferta) não foi criada
    expect(adsets.size + ads.size).toBe(0);
    expect([...metrics.values()][0]).toMatchObject({ level: 'campaign', date: '2026-10-19', spendCents: 1200, offerId: 'o1' });
  });

  it('sem campanha ligada a uma oferta, nem chama a Meta', async () => {
    const g = graphOf([row('10', '2026-10-19', '12')]);
    const r = await light(fakeStore().store, g);
    expect(g.insights).not.toHaveBeenCalled();
    expect(r.metricRows).toBe(0);
  });

  it('repetir a leitura atualiza o gasto de hoje sem duplicar', async () => {
    const { store, metrics } = fakeStore(LINKED);
    await light(store, graphOf([row('10', '2026-10-19', '12')]));
    await light(store, graphOf([row('10', '2026-10-19', '15.5')]));
    expect(metrics.size).toBe(1);
    expect([...metrics.values()][0]!.spendCents).toBe(1550);
  });

  it('runMetaSync em modo leve repassa o modo e avisa o registro', async () => {
    const recordRun = vi.fn(async () => {});
    const db: RunDb = {
      connection: async () => ({ id: 'c', expiresAt: null, token: 't', accounts: [account] }),
      lastRunStartedAt: async () => null,
      recordRun,
      markDisconnected: async () => {},
      storeFor: () => fakeStore(LINKED).store,
    };
    const g = graphOf([row('10', '2026-10-19', '12')]);
    expect(await runMetaSync({ userId: 'u', graph: g, db, now, mode: 'leve' })).toMatchObject({ ok: true, metricRows: 1 });
    expect(g.campaigns).not.toHaveBeenCalled();
    expect(recordRun).toHaveBeenCalledWith('u', expect.objectContaining({ light: true, ok: true }));
  });

  it('o registro das leituras leves atualiza a última linha; só uma falha nova abre linha', () => {
    expect(planRunRecord(null, { ok: true, error: null, light: true })).toBe('insert');
    expect(planRunRecord({ ok: true, error: null }, { ok: true, error: null, light: true })).toBe('update');
    expect(planRunRecord({ ok: false, error: 'limite_da_meta' }, { ok: true, error: null, light: true })).toBe('update');
    expect(planRunRecord({ ok: true, error: null }, { ok: false, error: 'meta_erro', light: true })).toBe('insert');
    expect(planRunRecord({ ok: false, error: 'meta_erro' }, { ok: false, error: 'meta_erro', light: true })).toBe('update');
    expect(planRunRecord({ ok: false, error: 'meta_erro' }, { ok: false, error: 'banco', light: true })).toBe('insert');
    // A leitura completa e o botão sempre abrem linha.
    expect(planRunRecord({ ok: true, error: null }, { ok: true, error: null })).toBe('insert');
  });
});

describe('atualização ao abrir o app', () => {
  const conn = (status: 'conectado' | 'expirando' | 'desconectado' | 'nao_conectado', delayMinutes: number | null, ok = true) => ({
    status,
    lastSync: delayMinutes === null ? null : { delayMinutes, ok },
  });

  it('atualiza quando a última leitura tem 2 minutos ou mais', () => {
    expect(shouldRefresh(conn('conectado', 1))).toBe(false);
    expect(shouldRefresh(conn('conectado', 2))).toBe(true);
    expect(shouldRefresh(conn('expirando', 30))).toBe(true);
  });

  it('nunca na primeira vez (é manual), sem conexão ou desconectado', () => {
    expect(shouldRefresh(conn('conectado', null))).toBe(false);
    expect(shouldRefresh(conn('nao_conectado', 90))).toBe(false);
    expect(shouldRefresh(conn('desconectado', 90))).toBe(false);
  });

  it('depois de uma falha espera 15 minutos, para não insistir num erro', () => {
    expect(shouldRefresh(conn('conectado', 10, false))).toBe(false);
    expect(shouldRefresh(conn('conectado', 15, false))).toBe(true);
  });

  it('várias navegações juntas disparam uma leitura só por usuário; outro usuário não é afetado', () => {
    expect(claimRefresh('u-1', 1_000_000)).toBe(true);
    expect(claimRefresh('u-1', 1_030_000)).toBe(false);
    expect(claimRefresh('u-2', 1_030_000)).toBe(true);
    expect(claimRefresh('u-1', 1_061_000)).toBe(true);
  });
});
