import { describe, expect, it, vi } from 'vitest';
import { createGraph } from '@/lib/meta/graph';
import { AD_FIELDS, CREATIVE_FIELDS, parseCreative, safeImageUrl } from '@/lib/meta/insights';
import type { MetaEnv } from '@/lib/meta/config';
import { syncAdAccount, type SyncGraph, type SyncStore } from '@/lib/meta/sync';

const env: MetaEnv = { appId: '123456', appSecret: 'segredo-do-app-0123456789abcdef', configId: null, graphVersion: 'v23.0' };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const CDN = 'https://scontent.xx.fbcdn.net/v/t45/abc.jpg?oh=1';

describe('criativos: formato e miniatura', () => {
  it('só aceita imagem https da CDN do Meta', () => {
    expect(safeImageUrl(CDN)).toBe(CDN);
    expect(safeImageUrl('http://scontent.xx.fbcdn.net/a.jpg')).toBeNull();
    expect(safeImageUrl('https://exemplo.com/a.jpg')).toBeNull();
    expect(safeImageUrl('https://fbcdn.net.exemplo.com/a.jpg')).toBeNull();
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
  });
  it('vídeo, imagem e tipos não detectados (sem adivinhar)', () => {
    expect(parseCreative({ id: '1', video_id: '9', thumbnail_url: CDN })).toEqual({ format: 'video', thumbnailUrl: CDN, videoId: '9' });
    expect(parseCreative({ id: '2', object_type: 'PHOTO', image_url: CDN, thumbnail_url: 'https://x.fbcdn.net/t.jpg' }).thumbnailUrl).toBe(CDN);
    expect(parseCreative({ id: '3', object_type: 'SHARE', thumbnail_url: CDN })).toMatchObject({ format: null, thumbnailUrl: CDN });
  });
});

describe('Graph: criativos e duração', () => {
  it('campos simples (sem expansão), miniatura maior e vídeos em lotes de 50', async () => {
    const urls: URL[] = [];
    const graph = createGraph(env, async (raw) => {
      const u = new URL(raw);
      urls.push(u);
      return u.pathname.endsWith('/adcreatives') ? json({ data: [] }) : json(Object.fromEntries(u.searchParams.get('ids')!.split(',').map((id) => [id, { length: 42.4 }])));
    });
    await graph.adCreatives('tok', 'act_1');
    const ids = Array.from({ length: 60 }, (_, i) => String(1000 + i));
    const lengths = await graph.videoLengths('tok', ids);
    expect(urls[0]!.pathname).toBe('/v23.0/act_1/adcreatives');
    expect(urls[0]!.searchParams.get('fields')).toBe(CREATIVE_FIELDS.join(','));
    expect(urls[0]!.searchParams.get('thumbnail_width')).toBe('480');
    expect(AD_FIELDS).toContain('creative');
    for (const u of urls) expect(u.searchParams.get('fields')).not.toMatch(/[{}()]/);
    expect(urls.filter((u) => u.searchParams.has('ids'))).toHaveLength(2);
    expect(lengths.get('1000')).toBe(42);
    expect(lengths.size).toBe(60);
  });
});

function setup(graphOver: Partial<SyncGraph>) {
  const upserted: Array<{ metaAdId: string; creative?: unknown }> = [];
  const store: SyncStore = {
    campaignsOfAccount: async () => [{ id: 'cx', metaCampaignId: '10', offerId: 'o1' }],
    upsertCampaigns: async (_a, rows) => rows.map((r) => ({ id: 'cx', metaCampaignId: r.metaCampaignId, offerId: 'o1' })),
    upsertAdsets: async (rows) => rows.map((r) => ({ id: `s-${r.metaAdsetId}`, metaId: r.metaAdsetId })),
    upsertAds: async (rows) => (upserted.push(...rows), rows.map((r) => ({ id: `a-${r.metaAdId}`, metaId: r.metaAdId }))),
    upsertMetrics: async () => undefined,
  };
  const graph: SyncGraph = {
    campaigns: async () => [{ id: '10', name: 'C' }],
    adsets: async () => [{ id: '20', name: 'CJ', campaign_id: '10' }],
    ads: async () => [{ id: '30', name: 'AD', adset_id: '20', campaign_id: '10', creative: { id: 'c1' } }],
    insights: async (_t, _a, level) => (level === 'campaign' ? [{ campaign_id: '10', campaign_name: 'C', date_start: '2026-10-18', spend: '10' }] : []),
    ...graphOver,
  };
  return { store, graph, upserted };
}
const run = (s: ReturnType<typeof setup>) => syncAdAccount({ graph: s.graph, store: s.store, token: 't', account: { id: 'a1', metaAccountId: 'act_1', currency: 'BRL' }, today: '2026-10-19', now: new Date('2026-10-19T15:00:00Z') });

describe('leitura: criativo do anúncio', () => {
  it('guarda formato, miniatura e duração', async () => {
    const s = setup({ adCreatives: async () => [{ id: 'c1', video_id: '9', thumbnail_url: CDN }], videoLengths: async () => new Map([['9', 42]]) });
    await run(s);
    expect(s.upserted[0]!.creative).toEqual({ format: 'video', thumbnailUrl: CDN, durationSeconds: 42 });
  });
  it('falha ao ler criativos não derruba a leitura e não apaga o que existia', async () => {
    const s = setup({ adCreatives: vi.fn(async () => { throw new Error('boom'); }) });
    await expect(run(s)).resolves.toMatchObject({ ads: 1 });
    expect(s.upserted[0]!.creative).toBeUndefined();
  });
  it('falha só na duração mantém a miniatura', async () => {
    const s = setup({ adCreatives: async () => [{ id: 'c1', video_id: '9', thumbnail_url: CDN }], videoLengths: async () => { throw new Error('boom'); } });
    await run(s);
    expect(s.upserted[0]!.creative).toEqual({ format: 'video', thumbnailUrl: CDN, durationSeconds: null });
  });
});
