/**
 * Núcleo da sincronização de uma conta de anúncios: Graph `campaigns` + `insights` → campanhas e métricas diárias.
 * Sem rede nem banco aqui: o cliente da Graph e o armazenamento entram por parâmetro (testável).
 */

import {
  campaignStatus,
  dailyBudgetCents,
  matchOfferId,
  parseInsightRow,
  planWindow,
  type InsightRow,
  type MetaCampaign,
} from './insights';

export interface SyncGraph {
  campaigns(token: string, accountId: string): Promise<MetaCampaign[]>;
  campaignInsights(token: string, accountId: string, since: string, until: string): Promise<InsightRow[]>;
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
  campaignId: string;
  date: string;
  spendCents: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  checkoutsInitiated: number;
  metaPurchases: number;
  metaPurchaseValueCents: number;
}

export interface SyncStore {
  offers(): Promise<Array<{ id: string; code: string }>>;
  campaignsOfAccount(adAccountId: string): Promise<CampaignRecord[]>;
  upsertCampaigns(adAccountId: string, rows: CampaignUpsert[]): Promise<CampaignRecord[]>;
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

  const [offers, existing, listed] = await Promise.all([
    store.offers(),
    store.campaignsOfAccount(account.id),
    graph.campaigns(token, account.metaAccountId),
  ]);
  const { since, until } = planWindow(today, existing.length === 0);
  const insights = (await graph.campaignInsights(token, account.metaAccountId, since, until))
    .map(parseInsightRow)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Campanhas com métricas mas fora da listagem (ex.: arquivadas) também entram.
  const byMetaId = new Map<string, MetaCampaign>(listed.map((c) => [c.id, c]));
  for (const row of insights) {
    if (!byMetaId.has(row.campaignId)) byMetaId.set(row.campaignId, { id: row.campaignId, name: row.campaignName });
  }

  const known = new Map(existing.map((c) => [c.metaCampaignId, c]));
  const upserts: CampaignUpsert[] = [...byMetaId.values()].map((c) => ({
    metaCampaignId: c.id,
    name: c.name,
    status: campaignStatus(c.effective_status),
    dailyBudgetCents: dailyBudgetCents(c.daily_budget),
    // O vínculo manual (offer_id já preenchido) nunca é trocado pelo padrão do nome.
    offerId: known.get(c.id)?.offerId ?? matchOfferId(c.name, offers),
  }));

  const saved = upserts.length > 0 ? await store.upsertCampaigns(account.id, upserts) : [];
  const byId = new Map(saved.map((c) => [c.metaCampaignId, c]));

  // daily_metrics exige uma oferta: só campanhas ligadas a uma oferta guardam métricas.
  const metrics: MetricUpsert[] = [];
  for (const row of insights) {
    const campaign = byId.get(row.campaignId);
    if (!campaign?.offerId) continue;
    metrics.push({
      offerId: campaign.offerId,
      campaignId: campaign.id,
      date: row.date,
      spendCents: row.spendCents,
      impressions: row.impressions,
      reach: row.reach,
      linkClicks: row.linkClicks,
      landingPageViews: row.landingPageViews,
      checkoutsInitiated: row.checkouts,
      metaPurchases: row.purchases,
      metaPurchaseValueCents: row.purchaseValueCents,
    });
  }
  if (metrics.length > 0) await store.upsertMetrics(metrics, now.toISOString());

  const linked = saved.filter((c) => c.offerId).length;
  return { campaigns: saved.length, linked, unlinked: saved.length - linked, metricRows: metrics.length };
}
