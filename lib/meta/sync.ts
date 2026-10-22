/**
 * Núcleo da sincronização de uma conta de anúncios: Graph `campaigns` + `insights` → campanhas e métricas diárias.
 * Sem rede nem banco aqui: o cliente da Graph e o armazenamento entram por parâmetro (testável).
 */

import {
  campaignStatus,
  dailyBudgetCents,
  parseEntityInsight,
  planWindow,
  type InsightLevel,
  type InsightRow,
  type MetaAd,
  type MetaAdset,
  type MetaCampaign,
  type ParsedEntityInsight,
} from './insights';

export interface SyncGraph {
  campaigns(token: string, accountId: string): Promise<MetaCampaign[]>;
  adsets(token: string, accountId: string): Promise<MetaAdset[]>;
  ads(token: string, accountId: string): Promise<MetaAd[]>;
  insights(token: string, accountId: string, level: InsightLevel, since: string, until: string): Promise<InsightRow[]>;
}

export interface CampaignRecord {
  id: string;
  metaCampaignId: string;
  offerId: string | null;
}

export interface CampaignUpsert {
  metaCampaignId: string;
  name: string;
  status: 'ativa' | 'pausada';
  dailyBudgetCents: number | null;
  offerId: string | null;
}

export interface MetricUpsert {
  offerId: string;
  level: InsightLevel;
  /** Id interno da campanha, do conjunto ou do anúncio, conforme o nível. */
  entityId: string;
  date: string;
  spendCents: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews3s: number;
  checkoutsInitiated: number;
  metaPurchases: number;
  metaPurchaseValueCents: number;
}

export interface SyncStore {
  campaignsOfAccount(adAccountId: string): Promise<CampaignRecord[]>;
  upsertCampaigns(adAccountId: string, rows: CampaignUpsert[]): Promise<CampaignRecord[]>;
  /** `campaignId` e `adsetId` são ids internos. */
  upsertAdsets(rows: Array<{ metaAdsetId: string; campaignId: string; name: string; status: 'ativa' | 'pausada' }>): Promise<Array<{ id: string; metaId: string }>>;
  upsertAds(rows: Array<{ metaAdId: string; adsetId: string; name: string; status: 'ativa' | 'pausada' }>): Promise<Array<{ id: string; metaId: string }>>;
  upsertMetrics(rows: MetricUpsert[], syncedAt: string): Promise<void>;
}

export interface AccountToSync {
  id: string; // id interno (ad_accounts.id)
  metaAccountId: string; // act_123
  currency: string | null;
}

export interface AccountResult {
  campaigns: number;
  linked: number;
  unlinked: number;
  metricRows: number;
  adsets: number;
  ads: number;
}

export async function syncAdAccount(opts: {
  graph: SyncGraph;
  store: SyncStore;
  token: string;
  account: AccountToSync;
  /** Hoje em America/Sao_Paulo, "YYYY-MM-DD". */
  today: string;
  now: Date;
}): Promise<AccountResult> {
  const { graph, store, token, account, today, now } = opts;
  if (account.currency !== 'BRL') throw new Error('moeda_nao_suportada');

  const [existing, listed] = await Promise.all([
    store.campaignsOfAccount(account.id),
    graph.campaigns(token, account.metaAccountId),
  ]);
  const { since, until } = planWindow(today, existing.length === 0);
  const fetchLevel = async (level: InsightLevel): Promise<ParsedEntityInsight[]> =>
    (await graph.insights(token, account.metaAccountId, level, since, until))
      .map((r) => parseEntityInsight(r, level))
      .filter((r): r is ParsedEntityInsight => r !== null);
  const insights = await fetchLevel('campaign');

  // Campanhas com métricas mas fora da listagem (ex.: arquivadas) também entram.
  const byMetaId = new Map<string, MetaCampaign>(listed.map((c) => [c.id, c]));
  for (const row of insights) {
    if (!byMetaId.has(row.entityId)) byMetaId.set(row.entityId, { id: row.entityId, name: row.campaignName });
  }

  const known = new Map(existing.map((c) => [c.metaCampaignId, c]));
  const upserts: CampaignUpsert[] = [...byMetaId.values()].map((c) => ({
    metaCampaignId: c.id,
    name: c.name,
    status: campaignStatus(c.effective_status),
    dailyBudgetCents: dailyBudgetCents(c.daily_budget),
    // O vínculo com a oferta é sempre escolhido pelo usuário (Nova oferta). A sincronização nunca liga campanhas pelo nome.
    offerId: known.get(c.id)?.offerId ?? null,
  }));

  const saved = upserts.length > 0 ? await store.upsertCampaigns(account.id, upserts) : [];
  const byId = new Map(saved.map((c) => [c.metaCampaignId, c]));

  // daily_metrics exige uma oferta: só campanhas ligadas a uma oferta guardam métricas.
  const metrics: MetricUpsert[] = [];
  for (const row of insights) {
    const campaign = byId.get(row.entityId);
    if (!campaign?.offerId) continue;
    metrics.push({
      offerId: campaign.offerId,
      level: 'campaign',
      entityId: campaign.id,
      date: row.date,
      spendCents: row.spendCents,
      impressions: row.impressions,
      reach: row.reach,
      linkClicks: row.linkClicks,
      landingPageViews: row.landingPageViews,
      videoViews3s: row.videoViews3s,
      checkoutsInitiated: row.checkouts,
      metaPurchases: row.purchases,
      metaPurchaseValueCents: row.purchaseValueCents,
    });
  }

  // Conjuntos e anúncios: só os de campanhas ligadas a uma oferta. Os totais da oferta usam só o nível campanha.
  const linkedByMetaId = new Map(saved.filter((c) => c.offerId).map((c) => [c.metaCampaignId, c]));
  const [listedAdsets, listedAds, adsetInsights, adInsights] = linkedByMetaId.size
    ? await Promise.all([graph.adsets(token, account.metaAccountId), graph.ads(token, account.metaAccountId), fetchLevel('adset'), fetchLevel('ad')])
    : [[], [], [], []];

  const adsetRows = listedAdsets.filter((a) => a.campaign_id && linkedByMetaId.has(a.campaign_id));
  for (const row of adsetInsights) {
    if (linkedByMetaId.has(row.campaignId) && !adsetRows.some((a) => a.id === row.entityId)) {
      adsetRows.push({ id: row.entityId, name: row.campaignName, campaign_id: row.campaignId });
    }
  }
  const savedAdsets = adsetRows.length
    ? await store.upsertAdsets(
        adsetRows.map((a) => ({
          metaAdsetId: a.id,
          campaignId: linkedByMetaId.get(a.campaign_id!)!.id,
          name: a.name,
          status: campaignStatus(a.effective_status),
        })),
      )
    : [];
  const adsetById = new Map(savedAdsets.map((a) => [a.metaId, a.id]));
  const adsetCampaign = new Map(adsetRows.map((a) => [a.id, a.campaign_id!]));

  const adRows = listedAds.filter((a) => a.adset_id && adsetById.has(a.adset_id));
  for (const row of adInsights) {
    if (row.adsetId && adsetById.has(row.adsetId) && !adRows.some((a) => a.id === row.entityId)) {
      adRows.push({ id: row.entityId, name: row.campaignName, adset_id: row.adsetId, campaign_id: row.campaignId });
    }
  }
  const savedAds = adRows.length
    ? await store.upsertAds(
        adRows.map((a) => ({ metaAdId: a.id, adsetId: adsetById.get(a.adset_id!)!, name: a.name, status: campaignStatus(a.effective_status) })),
      )
    : [];
  const adById = new Map(savedAds.map((a) => [a.metaId, a.id]));

  const entityRow = (row: ParsedEntityInsight, level: 'adset' | 'ad', entityId: string, offerId: string): MetricUpsert => ({
    offerId,
    level,
    entityId,
    date: row.date,
    spendCents: row.spendCents,
    impressions: row.impressions,
    reach: row.reach,
    linkClicks: row.linkClicks,
    landingPageViews: row.landingPageViews,
    videoViews3s: row.videoViews3s,
    checkoutsInitiated: row.checkouts,
    metaPurchases: row.purchases,
    metaPurchaseValueCents: row.purchaseValueCents,
  });
  for (const row of adsetInsights) {
    const id = adsetById.get(row.entityId);
    const offerId = linkedByMetaId.get(adsetCampaign.get(row.entityId) ?? row.campaignId)?.offerId;
    if (id && offerId) metrics.push(entityRow(row, 'adset', id, offerId));
  }
  for (const row of adInsights) {
    const id = adById.get(row.entityId);
    const offerId = linkedByMetaId.get(row.campaignId)?.offerId;
    if (id && offerId) metrics.push(entityRow(row, 'ad', id, offerId));
  }

  if (metrics.length > 0) await store.upsertMetrics(metrics, now.toISOString());

  const linked = saved.filter((c) => c.offerId).length;
  return {
    campaigns: saved.length,
    linked,
    unlinked: saved.length - linked,
    metricRows: metrics.length,
    adsets: savedAdsets.length,
    ads: savedAds.length,
  };
}
