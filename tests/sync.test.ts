import { describe, expect, it, vi } from 'vitest';
import { createGraph, MetaApiError } from '@/lib/meta/graph';
import {
  ATTRIBUTION_WINDOW,
  CAMPAIGN_FIELDS,
  INSIGHT_FIELDS,
  dailyBudgetCents,
  matchOfferId,
  offerCodeFromCampaignName,
  parseInsightRow,
  planWindow,
} from '@/lib/meta/insights';
import { errorCodeOf, runMetaSync, type RunDb } from '@/lib/meta/run';
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

  it('código da oferta vem do início do nome da campanha', () => {
    expect(offerCodeFromCampaignName('vasos_CBO_escala')).toBe('VASOS');
    expect(offerCodeFromCampaignName('Ação_x')).toBe('ACAO');
    expect(offerCodeFromCampaignName('Campanha de teste')).toBeNull();
    const offers = [{ id: 'o1', code: 'vasos' }];
    expect(matchOfferId('VASOS_X', offers)).toBe('o1');
    expect(matchOfferId('OUTRA_X', offers)).toBeNull();
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
    expect(urls.map((u) => u.pathname)).toEqual(['/v23.0/act_1/campaigns', '/v23.0/act_1/insights']);
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

function fakeStore(initial: CampaignRecord[] = [], offers = [{ id: 'o1', code: 'VASOS' }]) {
  const campaigns = new Map(initial.map((c) => [c.metaCampaignId, { ...c }]));
  const metrics = new Map<string, MetricUpsert>();
  let n = 0;
  const store: SyncStore = {
    offers: async () => offers,
    campaignsOfAccount: async () => [...campaigns.values()],
    upsertCampaigns: async (_acc, rows) =>
      rows.map((r) => {
        const prev = campaigns.get(r.metaCampaignId);
        const rec = { id: prev?.id ?? `c${++n}`, metaCampaignId: r.metaCampaignId, offerId: r.offerId };
        campaigns.set(r.metaCampaignId, rec);
        return rec;
      }),
    upsertMetrics: async (rows) => {
      for (const r of rows) metrics.set(`${r.campaignId}|${r.date}`, r);
    },
  };
  return { store, campaigns, metrics };
}

const graphOf = (insights: object[], campaigns = [{ id: '10', name: 'VASOS_CBO', effective_status: 'ACTIVE', daily_budget: '20000' }, { id: '11', name: 'Teste solto' }]) => ({
  campaigns: vi.fn(async () => campaigns),
  campaignInsights: vi.fn(async () => insights as never[]),
});

const row = (id: string, date: string, spend: string) => ({ campaign_id: id, campaign_name: id, date_start: date, spend });
const account = { id: 'a1', metaAccountId: 'act_1', currency: 'BRL' };
const now = new Date('2026-10-19T15:00:00Z');

describe('syncAdAccount', () => {
  it('liga campanhas ao código da oferta e só guarda métricas das ligadas', async () => {
    const { store, metrics } = fakeStore();
    const r = await syncAdAccount({ graph: graphOf([row('10', '2026-10-18', '10'), row('11', '2026-10-18', '5')]), store, token: 't', account, today: '2026-10-19', now });
    expect(r).toEqual({ campaigns: 2, linked: 1, unlinked: 1, metricRows: 1 });
    expect([...metrics.values()][0]!).toMatchObject({ offerId: 'o1', spendCents: 1000 });
  });

  it('rodar duas vezes não duplica (idempotente) e atualiza os valores', async () => {
    const { store, metrics, campaigns } = fakeStore();
    const run = (spend: string) => syncAdAccount({ graph: graphOf([row('10', '2026-10-18', spend)]), store, token: 't', account, today: '2026-10-19', now });
    await run('10');
    await run('12');
    expect(metrics.size).toBe(1);
    expect(campaigns.size).toBe(2);
    expect([...metrics.values()][0]!.spendCents).toBe(1200);
  });

  it('o vínculo manual de uma campanha nunca é trocado pelo nome', async () => {
    const { store } = fakeStore([{ id: 'cx', metaCampaignId: '10', offerId: 'o2' }], [{ id: 'o1', code: 'VASOS' }, { id: 'o2', code: 'OUTRA' }]);
    const g = graphOf([row('10', '2026-10-18', '10')]);
    await syncAdAccount({ graph: g, store, token: 't', account, today: '2026-10-19', now });
    const saved = await store.campaignsOfAccount('a1');
    expect(saved.find((c) => c.metaCampaignId === '10')?.offerId).toBe('o2');
  });

  it('primeira vez pede 30 dias; depois 7', async () => {
    const first = graphOf([]);
    await syncAdAccount({ graph: first, store: fakeStore().store, token: 't', account, today: '2026-10-19', now });
    expect(first.campaignInsights).toHaveBeenCalledWith('t', 'act_1', '2026-09-20', '2026-10-19');
    const next = graphOf([]);
    await syncAdAccount({ graph: next, store: fakeStore([{ id: 'c', metaCampaignId: '10', offerId: null }]).store, token: 't', account, today: '2026-10-19', now });
    expect(next.campaignInsights).toHaveBeenCalledWith('t', 'act_1', '2026-10-13', '2026-10-19');
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
      storeFor: () => fakeStore().store,
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
    const graph = { campaigns: async () => { throw new MetaApiError('Error validating access token: token-secreto-muito-longo-123456', 190, 400); }, campaignInsights: async () => [] };
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
